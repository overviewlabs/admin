import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { JSDOM } from "jsdom";
import { HttpError, badRequest, forbidden, tooManyRequests } from "../errors.js";
import { isPrivateOrReservedIp } from "./remote-http-endpoint-guard.js";
import { guardedRemoteHttpFetch } from "./remote-http-fetch.js";

export type WebResearchScope = { scopeKey: string; signal?: AbortSignal };
export type WebSearchCategory = "general" | "images" | "videos" | "news";
export type WebSearchInput = {
  query: string;
  category?: WebSearchCategory;
  count?: number;
  timeRange?: "day" | "week" | "month" | "year";
  language?: string;
};
export type WebSearchResult = {
  provider: "searxng";
  query: string;
  category: WebSearchCategory;
  timeRange?: WebSearchInput["timeRange"];
  dateFilter?: { appliedBy: "server"; rollingDays: number; since: string; until: string };
  // Publication times come from the search source, not an independent article
  // check. Matching a location in the query does not verify the result's city,
  // township, or county; callers must establish that from source evidence.
  newsEvidence?: { publicationDates: "source_provided"; geographicRelevance: "unverified" };
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    duration?: string;
    publishedAt?: string;
  }>;
  sources: Array<{ title: string; uri: string }>;
  warnings?: string[];
};
export type WebPageResult = {
  provider: "web";
  url: string;
  title: string;
  text: string;
  sources: Array<{ title: string; uri: string }>;
  truncated: boolean;
  offset?: number;
  nextOffset?: number;
  totalCharacters?: number;
  links?: Array<{ title: string; url: string }>;
};

const REQUEST_TIMEOUT_MS = 18_000;
const SEARCH_TIMEOUT_MS = 6_000;
// Native News selectors improve discovery. Independently enforce exact rolling
// UTC durations against source-provided publication timestamps.
const NEWS_TIME_RANGE_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;
const NO_NEWS_DATE_MATCH = "No News results with a verified publication date matched the requested time range. Undated, future, and out-of-range results were excluded.";
const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 128;
const MAX_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;
const RATE_WINDOW_MS = 60_000;
const MAX_SCOPES = 1024;
const scopes = new Map<string, { startedAt: number; requests: number; active: number }>();
const cache = new Map<string, { until: number; bytes: number; value: WebSearchResult | WebPageResult }>();
const searches = new Map<string, {
  controller: AbortController;
  promise: Promise<WebSearchResult>;
  waiters: number;
}>();
let cacheBytes = 0;

function abortError() {
  return new DOMException("Web research was cancelled.", "AbortError");
}

function scopeHash(scope: WebResearchScope) {
  if (typeof scope.scopeKey !== "string" || !scope.scopeKey.trim() || scope.scopeKey.length > 512) {
    throw badRequest("Web research requires an authorized scope.");
  }
  return createHash("sha256").update(scope.scopeKey).digest("hex");
}

function acquireScope(key: string) {
  const now = Date.now();
  for (const [id, entry] of scopes) {
    if (!entry.active && now - entry.startedAt >= RATE_WINDOW_MS) scopes.delete(id);
  }
  let entry = scopes.get(key);
  if (!entry) {
    if (scopes.size >= MAX_SCOPES) throw tooManyRequests("Web research is busy. Try again shortly.");
    entry = { startedAt: now, requests: 0, active: 0 };
    scopes.set(key, entry);
  } else if (now - entry.startedAt >= RATE_WINDOW_MS) {
    entry.startedAt = now;
    entry.requests = 0;
  }
  if (entry.active >= 2 || entry.requests >= 30) {
    throw tooManyRequests("Web research limit reached. Wait a minute before trying again.");
  }
  entry.active++;
  entry.requests++;
  return () => { entry.active--; };
}

function discardCache(key: string) {
  const previous = cache.get(key);
  if (previous) cacheBytes -= previous.bytes;
  cache.delete(key);
}

async function research<T extends WebSearchResult | WebPageResult>(
  operation: string,
  input: unknown,
  scope: WebResearchScope,
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  if (scope.signal?.aborted) throw abortError();
  const owner = scopeHash(scope);
  const release = acquireScope(owner);
  const key = createHash("sha256").update(JSON.stringify([owner, operation, input])).digest("hex");
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  scope.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  timeout.unref?.();
  let rejectAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(timedOut
      ? new HttpError(504, "Web research timed out. Try a narrower search or another public page.")
      : abortError());
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    for (const [id, entry] of cache) if (entry.until <= Date.now()) discardCache(id);
    const existing = cache.get(key);
    if (existing) return structuredClone(existing.value) as T;
    const value = await Promise.race([run(controller.signal), cancelled]);
    if (controller.signal.aborted) throw timedOut ? new HttpError(504, "Web research timed out.") : abortError();
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes <= MAX_CACHE_BYTES) {
      while (cache.size >= MAX_CACHE_ENTRIES || cacheBytes + bytes > MAX_CACHE_BYTES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        discardCache(oldest);
      }
      cache.set(key, { value: structuredClone(value), bytes, until: Date.now() + CACHE_TTL_MS });
      cacheBytes += bytes;
    }
    return value;
  } catch (error) {
    if (scope.signal?.aborted) throw abortError();
    if (timedOut) throw new HttpError(504, "Web research timed out. Try a narrower search or another public page.");
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "The public research service could not complete this request. Try again shortly.");
  } finally {
    clearTimeout(timeout);
    scope.signal?.removeEventListener("abort", cancel);
    if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
    release();
  }
}

function sharedSearch(
  input: unknown,
  scope: WebResearchScope,
  run: (sharedScope: WebResearchScope) => Promise<WebSearchResult>,
): Promise<WebSearchResult> {
  if (scope.signal?.aborted) return Promise.reject(abortError());
  const key = createHash("sha256").update(JSON.stringify([scopeHash(scope), input])).digest("hex");
  let entry = searches.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    entry = { controller, promise: run({ scopeKey: scope.scopeKey, signal: controller.signal }), waiters: 0 };
    searches.set(key, entry);
    const started = entry;
    const cleanup = () => { if (searches.get(key) === started) searches.delete(key); };
    void started.promise.then(cleanup, cleanup);
  }
  const current = entry;
  // Bound attached listeners even when many callers share the same request.
  if (current.waiters >= 30) return Promise.reject(tooManyRequests("Web research is busy. Try again shortly."));
  current.waiters++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, result?: WebSearchResult) => {
      if (settled) return;
      settled = true;
      scope.signal?.removeEventListener("abort", cancel);
      current.waiters--;
      if (error) reject(error);
      else resolve(structuredClone(result!));
    };
    const cancel = () => {
      if (settled) return;
      finish(abortError());
      if (!current.waiters) {
        if (searches.get(key) === current) searches.delete(key);
        current.controller.abort();
      }
    };
    scope.signal?.addEventListener("abort", cancel, { once: true });
    void current.promise.then((result) => finish(undefined, result), (error: unknown) => finish(error));
    if (scope.signal?.aborted) cancel();
  });
}

function normalizedAddress(address: string): string | null {
  if (address.includes("%")) return null;
  const bare = address.replace(/^\[|\]$/g, "");
  if (!isIP(bare)) return null;
  return isIP(bare) === 6 ? new URL(`http://[${bare}]/`).hostname.slice(1, -1) : bare;
}

function isPublicAddress(address: string) {
  const normalized = normalizedAddress(address);
  if (!normalized || isPrivateOrReservedIp(normalized)) return false;
  if (isIP(normalized) === 4) return normalized !== "168.63.129.16";
  // Only ordinary global unicast IPv6. Exclude mapped/compatible IPv4,
  // translation/tunnelling, special-purpose 2001::/23 and documentation space.
  const [first, second] = normalized.split(":").map((part) => Number.parseInt(part || "0", 16));
  return first! >= 0x2000 && first! <= 0x3fff
    && !(first === 0x2001 && second! < 0x200)
    && first !== 0x2002
    && !(first === 0x3fff && second! < 0x1000);
}

function publicUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) {
    throw badRequest("Enter a valid public HTTP or HTTPS page URL.");
  }
  let url: URL;
  try { url = new URL(value); } catch { throw badRequest("Enter a valid public HTTP or HTTPS page URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw badRequest("Public page URLs must use HTTP or HTTPS without embedded credentials.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw forbidden("Public page access is limited to standard web ports.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw forbidden("Private, local, metadata, and reserved addresses cannot be read.");
  } else if (!hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|onion)$/.test(hostname)
    || hostname === "metadata.google.internal" || hostname === "metadata.goog") {
    throw forbidden("Private, local, metadata, and reserved addresses cannot be read.");
  }
  url.hash = "";
  return url;
}

function searchEndpoint() {
  let endpoint: URL;
  try { endpoint = new URL(process.env.OVERVIEW_SEARXNG_URL || "http://127.0.0.1:8888"); }
  catch { throw new HttpError(503, "Public search is not configured correctly. Ask an administrator to check SearXNG."); }
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password
    || !["127.0.0.1", "[::1]", "localhost"].includes(endpoint.hostname) || endpoint.search || endpoint.hash) {
    throw new HttpError(503, "Public search must use the administrator-configured local SearXNG service.");
  }
  if (endpoint.hostname === "localhost") endpoint.hostname = "127.0.0.1";
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/search`;
  return endpoint;
}

async function readBody(response: Response, signal: AbortSignal): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new HttpError(413, "This response is too large to read. Choose a smaller public page or narrower search.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, "This response is too large to read. Choose a smaller public page or narrower search.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function plainText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  const fragment = JSDOM.fragment(value.slice(0, limit * 4));
  fragment.querySelectorAll("script,style,template,noscript,iframe,object,embed").forEach((element) => element.remove());
  return (fragment.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function publicationTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 100) return undefined;
  // SearXNG serializes its datetime values as ISO timestamps. Do not let Date
  // invent a timezone or normalize impossible dates into our rolling window.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return undefined;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]!
    || hour > 23 || minute > 59 || second > 59) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function resultMetadata(row: Record<string, unknown>, category: WebSearchCategory) {
  if (category === "general") return {};
  const metadata: Pick<WebSearchResult["results"][number], "imageUrl" | "thumbnailUrl" | "duration" | "publishedAt"> = {};
  const image = category === "images" ? row.img_src : undefined;
  const thumbnail = row.thumbnail_src ?? row.thumbnail;
  for (const [field, value] of [["imageUrl", image], ["thumbnailUrl", thumbnail]] as const) {
    try { if (typeof value === "string") metadata[field] = publicUrl(value).href; } catch { /* Discard unsafe external metadata. */ }
  }
  if (category === "videos") {
    const duration = row.duration ?? row.length;
    if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0 && duration <= 31_536_000) {
      metadata.duration = `${duration} seconds`;
    } else if (typeof duration === "string") {
      const text = plainText(duration, 64);
      if (text) metadata.duration = text;
    }
  }
  const publishedAt = publicationTimestamp(row.publishedDate ?? row.published_at);
  if (publishedAt) metadata.publishedAt = publishedAt;
  return metadata;
}

function newsDateWindow(timeRange: NonNullable<WebSearchInput["timeRange"]>, now: number) {
  const rollingDays = NEWS_TIME_RANGE_DAYS[timeRange];
  return { appliedBy: "server" as const, rollingDays,
    since: new Date(now - rollingDays * 24 * 60 * 60 * 1000).toISOString(), until: new Date(now).toISOString() };
}

function withinNewsDateWindow(publishedAt: string | undefined, window: ReturnType<typeof newsDateWindow>) {
  if (!publishedAt) return false;
  const timestamp = Date.parse(publishedAt);
  return Number.isFinite(timestamp) && timestamp >= Date.parse(window.since) && timestamp <= Date.parse(window.until);
}

function filterDatedNews(result: WebSearchResult, timeRange: NonNullable<WebSearchInput["timeRange"]>) {
  // Recheck cache hits against now. A story aging out during the short cache
  // lifetime must not extend the caller's requested rolling window.
  const dateFilter = newsDateWindow(timeRange, Date.now());
  const results = result.results.filter(({ publishedAt }) => withinNewsDateWindow(publishedAt, dateFilter));
  const warnings = (result.warnings ?? []).filter((warning) => warning !== NO_NEWS_DATE_MATCH
    && warning !== "No usable public results were returned. Try a different search query.");
  if (!results.length) warnings.push(NO_NEWS_DATE_MATCH);
  const { warnings: _previousWarnings, ...rest } = result;
  return { ...rest, timeRange, dateFilter, results,
    sources: results.map(({ title, url }) => ({ title, uri: url })), ...(warnings.length ? { warnings } : {}) };
}

/** Public search only; callers must derive scopeKey from authenticated organization/user identity. */
export async function searchWeb(input: WebSearchInput, scope: WebResearchScope): Promise<WebSearchResult> {
  if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 500
    || /[\u0000-\u001f\u007f]/.test(input.query)) throw badRequest("Search queries must contain 1 to 500 characters.");
  if (input.category !== undefined && !["general", "images", "videos", "news"].includes(input.category)) {
    throw badRequest("Choose exactly one search category: general, images, videos, or news.");
  }
  // SearXNG's RawTextQuery parses whitespace-delimited bangs before form
  // categories, and <number overrides timeout_limit. Python also treats U+0085
  // as whitespace. Reject these directives rather than silently changing scope.
  if (input.query.split(/[\s\u0085]+/u).some((part) => part.startsWith("!") || /^<\p{N}/u.test(part))) {
    throw badRequest("Search queries cannot include engine, category, redirect, or timeout shortcuts. Use the category field instead.");
  }
  if (input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1)) throw badRequest("Search result count must be a positive integer.");
  if (input.timeRange !== undefined && !["day", "week", "month", "year"].includes(input.timeRange)) throw badRequest("Choose a supported search time range.");
  if (input.language !== undefined && (typeof input.language !== "string" || !/^[a-zA-Z]{2,8}(?:-[a-zA-Z]{2,8})?$/.test(input.language))) {
    throw badRequest("Choose a supported search language code.");
  }
  const normalized = { ...input, query: input.query.trim(), category: input.category ?? "general", count: Math.min(input.count ?? 3, 8) };
  const endpoint = searchEndpoint();
  const identity = { ...normalized, endpoint: endpoint.toString() };
  const result = await sharedSearch(identity, scope, (sharedScope) => research("search", identity, sharedScope, async (signal) => {
    const parameters = new URLSearchParams({ q: normalized.query, format: "json", categories: normalized.category, timeout_limit: "2.5" });
    if (normalized.timeRange) parameters.set("time_range", normalized.timeRange);
    if (normalized.language) parameters.set("language", normalized.language);
    const response = await fetch(endpoint, {
      method: "POST", body: parameters, signal, redirect: "manual", credentials: "omit",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "OverviewLabsResearch/1.0" },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new HttpError(503, "Public search is unavailable. Ask an administrator to check the local SearXNG service.");
    }
    let data: unknown;
    try { data = JSON.parse(await readBody(response, signal)); }
    catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "Public search returned an invalid response. Ask an administrator to check SearXNG JSON support.");
    }
    if (!data || typeof data !== "object" || !Array.isArray((data as Record<string, unknown>).results)) {
      throw new HttpError(502, "Public search returned an invalid response. Ask an administrator to check SearXNG JSON support.");
    }
    const results: WebSearchResult["results"] = [];
    const seen = new Set<string>();
    let excludedOtherCategory = false;
    const dateFilter = normalized.category === "news" && normalized.timeRange
      ? newsDateWindow(normalized.timeRange, Date.now()) : null;
    for (const entry of (data as { results: unknown[] }).results.slice(0, 100)) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.category === "string" && row.category && row.category !== normalized.category) {
        excludedOtherCategory = true;
        continue;
      }
      let url: URL;
      try { url = publicUrl(row.url); } catch { continue; }
      const metadata = resultMetadata(row, normalized.category);
      if (dateFilter && !withinNewsDateWindow(metadata.publishedAt, dateFilter)) continue;
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      results.push({ title: plainText(row.title, 300) || url.hostname, url: url.href,
        snippet: plainText(row.content, 400), ...metadata });
      if (results.length >= normalized.count) break;
    }
    const warnings: string[] = [];
    if (!results.length) warnings.push("No usable public results were returned. Try a different search query.");
    if (excludedOtherCategory) warnings.push("Results labeled with another search category were excluded.");
    if (Array.isArray((data as Record<string, unknown>).unresponsive_engines)
      && ((data as Record<string, unknown>).unresponsive_engines as unknown[]).length) {
      warnings.push("Some search engines did not respond; results may be incomplete.");
    }
    return { provider: "searxng", query: normalized.query, category: normalized.category,
      ...(normalized.category === "news" ? { newsEvidence: { publicationDates: "source_provided" as const, geographicRelevance: "unverified" as const } } : {}),
      ...(normalized.timeRange ? { timeRange: normalized.timeRange } : {}), results,
      sources: results.map(({ title, url }) => ({ title, uri: url })), ...(warnings.length ? { warnings } : {}) };
  }, SEARCH_TIMEOUT_MS));
  return normalized.category === "news" && normalized.timeRange ? filterDatedNews(result, normalized.timeRange) : result;
}

/** Read-only, unauthenticated web retrieval. Every redirect gets a fresh pinned public-address check. */
export async function readWebPage(input: { url: string; offset?: number }, scope: WebResearchScope): Promise<WebPageResult> {
  const initial = publicUrl(input.url);
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_BODY_BYTES) throw badRequest("Invalid page offset.");
  return research("page", { url: initial.href, offset }, scope, async (signal) => {
    let current = initial;
    for (let hop = 0; hop <= 4; hop++) {
      if (signal.aborted) throw abortError();
      const response = await guardedRemoteHttpFetch(current, {
        method: "GET", signal, redirect: "manual", credentials: "omit",
        headers: { accept: "text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9", "user-agent": "OverviewLabsResearch/1.0" },
      }, {
        allowPrivateNetwork: false,
        dnsTimeoutMs: 4_000,
        connectTimeoutMs: 6_000,
        responseTimeoutMs: REQUEST_TIMEOUT_MS,
        lookup: async (hostname) => {
          if (signal.aborted) throw abortError();
          const addresses = await lookup(hostname, { all: true, verbatim: true });
          if (signal.aborted) throw abortError();
          // Return a denied sentinel when ANY address is unsafe. The transport
          // must reject the complete answer, rather than try a mixed DNS set.
          if (addresses.some(({ address }) => !isPublicAddress(address))) return [{ address: "127.0.0.1", family: 4 }];
          return addresses.map(({ address }) => ({ address: normalizedAddress(address)!, family: isIP(normalizedAddress(address)!) }));
        },
        error: (_message, code) => code.includes("private") || code.includes("peer")
          ? forbidden("Private, local, metadata, and reserved addresses cannot be read.")
          : new HttpError(502, "The public page could not be reached securely. Try another source."),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location || hop === 4) throw new HttpError(502, "The public page redirected too many times or returned an invalid redirect.");
        let target: string;
        try { target = new URL(location, current).href; }
        catch { throw badRequest("The public page returned an invalid redirect."); }
        current = publicUrl(target);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new HttpError(502, `The public page returned HTTP ${response.status}. Try another public source.`);
      }
      const mediaType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!["text/html", "application/xhtml+xml", "text/plain", "text/markdown"].includes(mediaType)) {
        await response.body?.cancel().catch(() => undefined);
        throw new HttpError(415, "This reader supports public HTML and text pages. Choose a page rather than a download or PDF.");
      }
      const body = await readBody(response, signal);
      let title = current.hostname;
      let text = body;
      const links: Array<{ title: string; url: string }> = [];
      if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
        // JSDOM's default has neither script execution nor resource loading.
        const dom = new JSDOM(body, { url: current.href });
        try {
          const doc = dom.window.document;
          title = (doc.querySelector("title")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || title;
          doc.querySelectorAll("script,style,noscript,template,iframe,object,embed,svg,canvas,form,[hidden],[aria-hidden='true']")
            .forEach((element) => element.remove());
          const content = doc.querySelector("article,main") ?? doc.body;
          for (const anchor of content.querySelectorAll('a[href]')) {
            if (links.length >= 80) break;
            try {
              const url = publicUrl(new URL(anchor.getAttribute('href')!, current).href).href;
              const title = (anchor.textContent ?? '').replace(/\s+/g,' ').trim().slice(0,200);
              if (title && !links.some(link => link.url === url)) links.push({title,url});
            } catch { /* Non-web and private links are not navigation targets. */ }
          }
          content.querySelectorAll("br,p,div,section,article,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre")
            .forEach((element) => { element.prepend("\n"); element.append("\n"); });
          text = content.textContent ?? "";
        } finally { dom.window.close(); }
      }
      text = text.replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      return { provider: "web", url: current.href, title, text: text.slice(offset, offset + MAX_TEXT_CHARS),
        offset, totalCharacters: text.length, links,
        ...(text.length > offset + MAX_TEXT_CHARS ? { nextOffset: offset + MAX_TEXT_CHARS } : {}),
        sources: [{ title, uri: current.href }], truncated: text.length > offset + MAX_TEXT_CHARS };
    }
    throw new HttpError(502, "The public page redirected too many times.");
  });
}
