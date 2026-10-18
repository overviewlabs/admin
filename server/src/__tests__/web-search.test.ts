import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

let searchWeb: typeof import("../services/web-search.js").searchWeb;
let readWebPage: typeof import("../services/web-search.js").readWebPage;
const scope = { scopeKey: "company-1:user-1" };
const page = "https://93.184.216.34/page";
const html = (body: string, headers: Record<string, string> = {}) => new Response(body, {
  headers: { "content-type": "text/html; charset=utf-8", ...headers },
});
const search = (results: unknown[], extra = {}) => new Response(JSON.stringify({ results, ...extra }), {
  headers: { "content-type": "application/json" },
});

beforeEach(async () => {
  vi.resetModules();
  mocks.fetch.mockReset();
  mocks.lookup.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("OVERVIEW_SEARXNG_URL", "http://127.0.0.1:8888");
  ({ searchWeb, readWebPage } = await import("../services/web-search.js"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public web search", () => {
  it("uses the operator-owned local JSON endpoint, sanitizes citations, deduplicates and caps results", async () => {
    mocks.fetch.mockResolvedValue(search([
      { title: "Unsafe", url: "javascript:alert(1)", content: "bad" },
      { title: "Private", url: "http://127.0.0.1/secrets", content: "bad" },
      { title: "Credentials", url: "https://alice:password@example.org/", content: "bad" },
      { title: "<b>First &amp; best</b>", url: "https://news.example.org/story#first", content: "<script>steal()</script><p>Useful &amp; current</p>" },
      { title: "Duplicate", url: "https://news.example.org/story#second", content: "duplicate" },
      ...Array.from({ length: 12 }, (_, i) => ({ title: `Result ${i}`, url: `https://news.example.org/${i}`, content: "description" })),
    ], { unresponsive_engines: [["provider", "password-and-private-upstream-details"]] }));

    const result = await searchWeb({ query: "  current news  ", count: 99, timeRange: "week", language: "en-US" }, scope);
    expect(result.provider).toBe("searxng");
    expect(result.category).toBe("general");
    expect(result.query).toBe("current news");
    expect(result.results).toHaveLength(8);
    expect(result.results[0]).toEqual({ title: "First & best", url: "https://news.example.org/story", snippet: "Useful & current" });
    expect(result.sources[0]).toEqual({ title: "First & best", uri: "https://news.example.org/story" });
    expect(result.warnings).toEqual(["Some search engines did not respond; results may be incomplete."]);
    expect(JSON.stringify(result)).not.toContain("private-upstream");
    const [endpoint, init] = mocks.fetch.mock.calls[0]!;
    expect(endpoint.origin).toBe("http://127.0.0.1:8888");
    expect(endpoint.pathname).toBe("/search");
    expect(endpoint.search).toBe("");
    expect(Object.fromEntries(init.body)).toMatchObject({ q: "current news", format: "json", categories: "general", time_range: "week", language: "en-US", timeout_limit: "2.5" });
    expect(init).toMatchObject({ method: "POST", redirect: "manual", credentials: "omit" });
    expect(init.headers).not.toHaveProperty("authorization");
    expect(init.headers).not.toHaveProperty("cookie");
  });

  it.each(["general", "images", "videos", "news"] as const)("sends exactly the selected %s category and returns it", async (category) => {
    mocks.fetch.mockResolvedValue(search([{ title: "Result", url: "https://public.example.org/", content: "Description" }]));
    const result = await searchWeb({ query: "single category", category }, scope);
    const parameters = mocks.fetch.mock.calls[0]![1].body as URLSearchParams;
    expect(parameters.getAll("categories")).toEqual([category]);
    expect(parameters.has("engines")).toBe(false);
    expect(result.category).toBe(category);
  });

  it.each(["general", "images", "videos", "news"] as const)("does not relabel explicit upstream categories as %s or consume its result count", async (category) => {
    mocks.fetch.mockResolvedValue(search([
      ...["general", "images", "videos", "news"].filter((value) => value !== category).map((value) => ({
        category: value, title: `Wrong ${value}`, url: `https://public.example.org/${value}`,
      })),
      { category, title: "Selected category", url: "https://public.example.org/correct" },
      { title: "Legacy unlabeled result", url: "https://public.example.org/unlabeled" },
    ]));
    const result = await searchWeb({ query: "category boundary", category, count: 2 }, scope);
    expect(result.results.map(({ title }) => title)).toEqual(["Selected category", "Legacy unlabeled result"]);
    expect(result.sources.map(({ title }) => title)).toEqual(["Selected category", "Legacy unlabeled result"]);
    expect(result.warnings).toEqual(["Results labeled with another search category were excluded."]);
  });

  it.each(["general,news", "all", "News", "", null, ["images"], ["general", "news"]])("rejects invalid or plural category %j", async (category) => {
    await expect(searchWeb({ query: "test", category } as Parameters<typeof searchWeb>[0], scope)).rejects.toMatchObject({ status: 400 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["!news solar", "solar !images", "!bing_news solar", "solar !!g", "solar !!", "solar\u0085!videos", "solar\u2003!brave", "solar <60", "solar <９９９"])("blocks query override %s before network access", async (query) => {
    await expect(searchWeb({ query, category: "general" }, scope)).rejects.toMatchObject({ status: 400 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps ordinary exclamation marks and angle-bracket prose intact", async () => {
    mocks.fetch.mockResolvedValue(search([]));
    await searchWeb({ query: "Hello! HTML <article> CSS", category: "general" }, scope);
    expect(mocks.fetch.mock.calls[0]![1].body.get("q")).toBe("Hello! HTML <article> CSS");
  });

  it("keeps category caches separate and bounds default result/snippet sizes", async () => {
    mocks.fetch.mockImplementation(async () => search(Array.from({ length: 8 }, (_, index) => ({
      title: `Result ${index}`, url: `https://public.example.org/${index}`, content: "x".repeat(2000),
    }))));
    const general = await searchWeb({ query: "same text" }, scope);
    const news = await searchWeb({ query: "same text", category: "news" }, scope);
    const cachedNews = await searchWeb({ query: "same text", category: "news" }, scope);
    expect(general.results).toHaveLength(3);
    expect(general.results[0]!.snippet).toHaveLength(400);
    expect(news.category).toBe("news");
    expect(cachedNews).toEqual(news);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([["day", 1], ["week", 7], ["month", 30], ["year", 365]] as const)("strictly enforces the %s News window as %i rolling days before slicing count", async (timeRange, rollingDays) => {
    vi.useFakeTimers();
    const now = Date.parse("2026-09-27T12:00:00Z");
    vi.setSystemTime(now);
    const since = now - rollingDays * 24 * 60 * 60 * 1000;
    const row = (id: string, publishedDate?: string) => ({ title: id, url: `https://news.example.org/${id}`, content: "News", publishedDate });
    mocks.fetch.mockResolvedValue(search([
      row("too-old", new Date(since - 1).toISOString()),
      row("undated"),
      row("invalid-date", "not a date"),
      row("future", new Date(now + 1).toISOString()),
      row("at-start", new Date(since).toISOString()),
      row("at-now", new Date(now).toISOString()),
      row("within-window", new Date(now - 1000).toISOString()),
    ]));
    const result = await searchWeb({ query: "local news", category: "news", timeRange, count: 2 }, scope);
    expect(result.results.map(({ title }) => title)).toEqual(["at-start", "at-now"]);
    expect(result.sources.map(({ title }) => title)).toEqual(["at-start", "at-now"]);
    expect(result.timeRange).toBe(timeRange);
    expect(result.dateFilter).toEqual({ appliedBy: "server", rollingDays,
      since: new Date(since).toISOString(), until: new Date(now).toISOString() });
    const parameters = mocks.fetch.mock.calls[0]![1].body as URLSearchParams;
    expect(parameters.get("categories")).toBe("news");
    expect(parameters.get("time_range")).toBe(timeRange);
    expect(result.warnings).toBeUndefined();
  });

  it("reports no matching dated News results without relaxing the requested range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
    mocks.fetch.mockResolvedValue(search([
      { title: "Old", url: "https://news.example.org/old", publishedDate: "2026-09-20T12:00:00Z" },
      { title: "Undated", url: "https://news.example.org/undated" },
      { title: "Future", url: "https://news.example.org/future", publishedDate: "2026-09-28T12:00:00Z" },
    ]));
    const result = await searchWeb({ query: "today's news", category: "news", timeRange: "day" }, scope);
    expect(result.results).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.timeRange).toBe("day");
    expect(result.warnings).toEqual([expect.stringContaining("No News results with a verified publication date matched")]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not invent exact publication timestamps from impossible or ambiguous dates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T13:00:00Z"));
    const dates = ["2026-09-31T12:00:00Z", "2026-02-29T12:00:00Z", "2026-09-27T12:00:00",
      "2026-09-27", "Sep 27, 2026", "2026-09-27T24:00:00Z"];
    mocks.fetch.mockImplementation(async () => search(dates.map((publishedDate, index) => ({
      title: `Unverified ${index}`, url: `https://news.example.org/${index}`, publishedDate,
    }))));
    const dated = await searchWeb({ query: "precise publication dates", category: "news", timeRange: "year", count: 8 }, scope);
    expect(dated.results).toEqual([]);
    expect(dated.sources).toEqual([]);
    const unfiltered = await searchWeb({ query: "precise publication dates", category: "news", count: 8 }, scope);
    expect(unfiltered.results).toHaveLength(dates.length);
    expect(unfiltered.results.every((result) => result.publishedAt === undefined)).toBe(true);
  });

  it("handles source-provided timezone offsets and subsecond timestamps when filtering News", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-01T00:30:00Z"));
    mocks.fetch.mockResolvedValue(search([
      { title: "Leap day", url: "https://news.example.org/leap", publishedDate: "2024-02-29T23:59:59.123456+00:00" },
      { title: "Offset into window", url: "https://news.example.org/offset", publishedDate: "2024-03-01T05:00:00+05:30" },
      { title: "UTC with unknown local offset", url: "https://news.example.org/utc", publishedDate: "2024-02-29T23:00:00-00:00" },
      { title: "Offset outside window", url: "https://news.example.org/future", publishedDate: "2024-02-29T23:59:59-01:00" },
    ]));
    const result = await searchWeb({ query: "timezone aware dates", category: "news", timeRange: "day" }, scope);
    expect(result.results.map(({ title, publishedAt }) => ({ title, publishedAt }))).toEqual([
      { title: "Leap day", publishedAt: "2024-02-29T23:59:59.123Z" },
      { title: "Offset into window", publishedAt: "2024-02-29T23:30:00.000Z" },
      { title: "UTC with unknown local offset", publishedAt: "2024-02-29T23:00:00.000Z" },
    ]);
  });

  it("keeps geographic uncertainty explicit without dropping or relabeling township news", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
    mocks.fetch.mockImplementation(async () => search([
      { title: "Example Township crash", url: "https://news.example.org/township", publishedDate: "2026-09-26T12:00:00+00:00" },
    ]));
    const result = await searchWeb({ query: '"Example City, Ohio"', category: "news", timeRange: "week" }, scope);
    expect(result.results[0]!.title).toBe("Example Township crash");
    expect(result.newsEvidence).toEqual({ publicationDates: "source_provided", geographicRelevance: "unverified" });
    expect(result.warnings).toBeUndefined();
    const cached = await searchWeb({ query: '"Example City, Ohio"', category: "news", timeRange: "week" }, scope);
    expect(cached.newsEvidence).toEqual(result.newsEvidence);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const general = await searchWeb({ query: '"Example City, Ohio"', category: "general" }, scope);
    expect(general.newsEvidence).toBeUndefined();
  });

  it("keeps News ranges separate in cache and rechecks aging publication dates on cache hits", async () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-09-27T12:00:00Z");
    vi.setSystemTime(now);
    mocks.fetch.mockImplementation(async () => search([
      { title: "At daily boundary", url: "https://news.example.org/recent", publishedDate: new Date(now - 24 * 60 * 60 * 1000 + 5000).toISOString() },
      { title: "Three days old", url: "https://news.example.org/older", publishedDate: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString() },
    ]));
    const day = await searchWeb({ query: "local news", category: "news", timeRange: "day" }, scope);
    const week = await searchWeb({ query: "local news", category: "news", timeRange: "week" }, scope);
    expect(day.results).toHaveLength(1);
    expect(week.results).toHaveLength(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6000);
    const aged = await searchWeb({ query: "local news", category: "news", timeRange: "day" }, scope);
    expect(aged.results).toEqual([]);
    expect(aged.dateFilter?.until).toBe(new Date(now + 6000).toISOString());
    expect(aged.warnings).toEqual([expect.stringContaining("No News results with a verified publication date matched")]);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("retains native date filters for General and leaves undated unfiltered News available", async () => {
    mocks.fetch.mockImplementation(async () => search([{ title: "Undated", url: "https://public.example.org/", content: "Content" }]));
    const general = await searchWeb({ query: "recent findings", category: "general", timeRange: "week" }, scope);
    expect(mocks.fetch.mock.calls[0]![1].body.get("time_range")).toBe("week");
    expect(general.timeRange).toBe("week");
    expect(general.dateFilter).toBeUndefined();
    expect(general.results).toHaveLength(1);
    const news = await searchWeb({ query: "local news", category: "news" }, scope);
    expect(news.results).toHaveLength(1);
    expect(news.timeRange).toBeUndefined();
    expect(news.dateFilter).toBeUndefined();
  });

  it("preserves safe media metadata without fetching images, thumbnails or embedded players", async () => {
    mocks.fetch.mockResolvedValueOnce(search([
      { title: "Photo", url: "https://photos.example.org/one", img_src: "https://photos.example.org/full.jpg", thumbnail_src: "https://photos.example.org/thumb.jpg" },
      { title: "Unsafe image", url: "https://photos.example.org/two", img_src: "http://[::ffff:127.0.0.1]/private", thumbnail_src: "javascript:alert(1)" },
    ]));
    const images = await searchWeb({ query: "photos", category: "images" }, scope);
    expect(images.results[0]).toMatchObject({ imageUrl: "https://photos.example.org/full.jpg", thumbnailUrl: "https://photos.example.org/thumb.jpg" });
    expect(images.results[1]).not.toHaveProperty("imageUrl");
    expect(images.results[1]).not.toHaveProperty("thumbnailUrl");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    mocks.fetch.mockResolvedValueOnce(search([
      { title: "Video", url: "https://videos.example.org/watch", thumbnail: "https://videos.example.org/preview.jpg", length: "<b>04:31</b>", publishedDate: "2026-09-27T10:30:00Z", iframe_src: "http://127.0.0.1/private" },
      { title: "Numeric duration", url: "https://videos.example.org/watch2", duration: 120, thumbnail: "data:text/html,secret" },
    ]));
    const videos = await searchWeb({ query: "videos", category: "videos" }, scope);
    expect(videos.results[0]).toMatchObject({ thumbnailUrl: "https://videos.example.org/preview.jpg", duration: "04:31", publishedAt: "2026-09-27T10:30:00.000Z" });
    expect(videos.results[0]).not.toHaveProperty("iframe_src");
    expect(videos.results[1]).toMatchObject({ duration: "120 seconds" });
    expect(videos.results[1]).not.toHaveProperty("thumbnailUrl");

    mocks.fetch.mockResolvedValueOnce(search([{ title: "News", url: "https://news.example.org/article", thumbnail: "https://user:password@news.example.org/preview.jpg", publishedDate: "invalid date", length: "x".repeat(1000) }]));
    const news = await searchWeb({ query: "news", category: "news" }, scope);
    expect(news.results[0]).not.toHaveProperty("thumbnailUrl");
    expect(news.results[0]).not.toHaveProperty("publishedAt");
    expect(news.results[0]).not.toHaveProperty("duration");
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("shares in-flight searches only within one scope and cancellation does not cancel another caller", async () => {
    let complete!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const abort = new AbortController();
    const first = searchWeb({ query: "shared" }, { ...scope, signal: abort.signal }).catch((error) => error);
    const second = searchWeb({ query: "shared" }, scope);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    abort.abort();
    expect(await first).toMatchObject({ name: "AbortError" });
    expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(false);
    complete(search([{ title: "Shared result", url: "https://public.example.org/", content: "Result" }]));
    const result = await second;
    expect(result.results[0]!.title).toBe("Shared result");
    mocks.fetch.mockResolvedValueOnce(search([]));
    await searchWeb({ query: "shared" }, { scopeKey: "different-company:user" });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels the upstream search when its last subscriber aborts and ignores late results", async () => {
    let complete!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const abort = new AbortController();
    const first = searchWeb({ query: "aborted shared" }, { ...scope, signal: abort.signal }).catch((error) => error);
    abort.abort();
    expect(await first).toMatchObject({ name: "AbortError" });
    expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    complete(search([{ title: "Late result", url: "https://public.example.org/", content: "Late" }]));
    await Promise.resolve();
    mocks.fetch.mockResolvedValueOnce(search([{ title: "Fresh result", url: "https://public.example.org/", content: "Fresh" }]));
    const fresh = await searchWeb({ query: "aborted shared" }, scope);
    expect(fresh.results[0]!.title).toBe("Fresh result");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("isolates cached searches by authorized scope, copies results and expires them", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(async () => search([{ title: "Fresh", url: "https://public.example.org/", content: "Snippet" }]));
    const first = await searchWeb({ query: "public information" }, scope);
    first.results[0]!.title = "Mutated by caller";
    expect((await searchWeb({ query: "public information" }, scope)).results[0]!.title).toBe("Fresh");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await searchWeb({ query: "public information" }, { scopeKey: "company-2:user-1" });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_001);
    await searchWeb({ query: "public information" }, scope);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects caller-supplied endpoint control and returns an actionable safe outage", async () => {
    vi.stubEnv("OVERVIEW_SEARXNG_URL", "https://external.example.org");
    await expect(searchWeb({ query: "test" }, scope)).rejects.toMatchObject({ status: 503 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("OVERVIEW_SEARXNG_URL", "http://127.0.0.1:8888");
    mocks.fetch.mockResolvedValue(new Response("secret upstream response", { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    await expect(searchWeb({ query: "test" }, scope)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("SearXNG") });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds queries and validates filters before accessing the network", async () => {
    await expect(searchWeb({ query: "a".repeat(501) }, scope)).rejects.toMatchObject({ status: 400 });
    await expect(searchWeb({ query: "hello\nworld" }, scope)).rejects.toMatchObject({ status: 400 });
    await expect(searchWeb({ query: "test", count: 0 }, scope)).rejects.toMatchObject({ status: 400 });
    await expect(searchWeb({ query: "test", language: "en&url=private" }, scope)).rejects.toMatchObject({ status: 400 });
    await expect(searchWeb({ query: "test" }, { scopeKey: "" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("tells callers when no usable public result exists", async () => {
    mocks.fetch.mockResolvedValue(search([{ title: "local", url: "http://localhost/", content: "secret" }]));
    const result = await searchWeb({ query: "no results" }, scope);
    expect(result.results).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.warnings?.[0]).toContain("No usable public results");
  });

  it("limits concurrent work per scope and releases slots after cancellation", async () => {
    mocks.fetch.mockImplementation(() => new Promise(() => undefined));
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();
    const first = searchWeb({ query: "first" }, { ...scope, signal: firstAbort.signal }).catch((error) => error);
    const second = searchWeb({ query: "second" }, { ...scope, signal: secondAbort.signal }).catch((error) => error);
    await expect(searchWeb({ query: "third" }, scope)).rejects.toMatchObject({ status: 429 });
    firstAbort.abort();
    secondAbort.abort();
    expect(await first).toMatchObject({ name: "AbortError" });
    expect(await second).toMatchObject({ name: "AbortError" });
    mocks.fetch.mockResolvedValue(search([]));
    await expect(searchWeb({ query: "after cancellation" }, scope)).resolves.toMatchObject({ provider: "searxng" });
  });

  it("throttles even cache hits without affecting another scope", async () => {
    mocks.fetch.mockImplementation(async () => search([]));
    for (let i = 0; i < 30; i++) await searchWeb({ query: "repeated" }, scope);
    await expect(searchWeb({ query: "repeated" }, scope)).rejects.toMatchObject({ status: 429 });
    await expect(searchWeb({ query: "repeated" }, { scopeKey: "another-company:user" })).resolves.toMatchObject({ provider: "searxng" });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("enforces a total deadline even if a transport ignores its abort signal", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => new Promise(() => undefined));
    const result = searchWeb({ query: "timed out" }, scope).catch((error) => error);
    await vi.advanceTimersByTimeAsync(5_999);
    expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ status: 504 });
    expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("public page reader", () => {
  it.each([
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/",
    "http://10.0.0.1/", "http://172.16.1.1/", "http://192.168.0.1/", "http://169.254.169.254/",
    "http://100.100.100.200/", "http://168.63.129.16/", "http://224.0.0.1/", "http://0.0.0.0/",
    "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[0:0:0:0:0:ffff:7f00:1]/", "http://[::7f00:1]/",
    "http://[fe80::1]/", "http://[fc00::1]/", "http://[2001:db8::1]/", "http://[2002:7f00:1::]/",
    "http://[64:ff9b::7f00:1]/", "http://[3fff::1]/", "http://localhost./", "http://something.local/",
    "http://metadata.google.internal/", "https://public.example.org:444/", "http://[::ffff:5db8:d822]/",
  ])("blocks unsafe destination %s before fetching", async (url) => {
    await expect(readWebPage({ url }, scope)).rejects.toMatchObject({ status: 403 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects protocols, credentials and whitespace instead of forwarding them", async () => {
    for (const url of ["file:///etc/passwd", "https://username:secret@public.example.org/", " https://public.example.org/", "https://public.example.org/\nprivate"]) {
      await expect(readWebPage({ url }, scope)).rejects.toMatchObject({ status: 400 });
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects mixed DNS answers and expanded IPv6-mapped private answers before opening a socket", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }, { address: "10.1.2.3", family: 4 }]);
    await expect(readWebPage({ url: "https://public.example.org/page" }, scope)).rejects.toMatchObject({ status: 403 });
    mocks.lookup.mockResolvedValueOnce([{ address: "0:0:0:0:0:ffff:a00:1", family: 6 }]);
    await expect(readWebPage({ url: "https://public.example.org/page" }, scope)).rejects.toMatchObject({ status: 403 });
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("checks redirected destinations independently and refuses metadata redirects", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }));
    await expect(readWebPage({ url: page }, scope)).rejects.toMatchObject({ status: 403 });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0]![1].redirect).toBe("manual");
  });

  it("does not forward cookies or authorization to redirected public pages", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://93.184.216.35/article", "set-cookie": "private=session" } }));
    mocks.fetch.mockResolvedValueOnce(html("<title>Article</title><main><p>Useful content.</p></main>"));
    const result = await readWebPage({ url: page }, scope);
    expect(result).toMatchObject({ provider: "web", url: "https://93.184.216.35/article", title: "Article", text: "Useful content.", truncated: false });
    expect(result.sources).toEqual([{ title: "Article", uri: "https://93.184.216.35/article" }]);
    for (const [, init] of mocks.fetch.mock.calls) {
      expect(init.credentials).toBe("omit");
      expect(Object.keys(init.headers)).not.toContain("cookie");
      expect(Object.keys(init.headers)).not.toContain("authorization");
    }
  });

  it("removes executable and hidden page content without loading linked resources", async () => {
    mocks.fetch.mockResolvedValue(html(`<title>A &amp; B</title><script>globalThis.stolen = true</script>
      <link rel="stylesheet" href="http://127.0.0.1/secrets"><main><style>private css</style>
      <h1>Heading</h1><p>First paragraph.</p><p>Second <strong>paragraph</strong>.</p>
      <iframe src="http://169.254.169.254/"></iframe><div hidden>Hidden secret</div>
      <form><input value="credential">Do not extract this form</form><img src="http://127.0.0.1/image"></main>`));
    const result = await readWebPage({ url: page }, scope);
    expect(result.title).toBe("A & B");
    expect(result.text).toBe("Heading\n\nFirst paragraph.\n\nSecond paragraph.");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis).not.toHaveProperty("stolen");
  });

  it("bounds extracted text and marks truncation", async () => {
    mocks.fetch.mockResolvedValue(new Response("A".repeat(40_000), { headers: { "content-type": "text/plain" } }));
    const result = await readWebPage({ url: page }, scope);
    expect(result.text).toHaveLength(30_000);
    expect(result.truncated).toBe(true);
  });

  it("returns public navigation links and allows continuing long articles", async () => {
    mocks.fetch.mockImplementation(async () => html('<article><a href="/related">Related report</a><a href="http://127.0.0.1/private">Private</a><p>' + 'A'.repeat(31000) + '</p><p>Final details</p></article>'));
    const first = await readWebPage({url:page},scope);
    expect(first.links).toContainEqual({title:'Related report',url:new URL('/related',page).href});
    expect(first.links?.some(link => link.url.includes('127.0.0.1'))).toBe(false);
    expect(first.nextOffset).toBe(30000);
    const last = await readWebPage({url:page,offset:first.nextOffset},scope);
    expect(last.text).toContain('Final details'); expect(last.truncated).toBe(false);
  });

  it("cancels oversized decoded streams even when content length is absent", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel,
    });
    mocks.fetch.mockResolvedValue(new Response(stream, { headers: { "content-type": "text/html" } }));
    await expect(readWebPage({ url: page }, scope)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels stalled response bodies at the total deadline and does not cache failures", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    mocks.fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/html" } }));
    const failure = readWebPage({ url: page }, scope).catch((error) => error);
    await vi.advanceTimersByTimeAsync(18_000);
    expect(await failure).toMatchObject({ status: 504 });
    expect(cancel).toHaveBeenCalledTimes(1);
    mocks.fetch.mockResolvedValueOnce(html("<p>Recovered</p>"));
    expect((await readWebPage({ url: page }, scope)).text).toBe("Recovered");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not return cache content to an already cancelled caller", async () => {
    mocks.fetch.mockResolvedValue(html("<p>Public content</p>"));
    await readWebPage({ url: page }, scope);
    const abort = new AbortController();
    abort.abort();
    await expect(readWebPage({ url: page }, { ...scope, signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("caps redirects and rejects non-text responses", async () => {
    mocks.fetch.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    await expect(readWebPage({ url: page }, scope)).rejects.toMatchObject({ status: 502 });
    expect(mocks.fetch).toHaveBeenCalledTimes(5);
    mocks.fetch.mockResolvedValue(new Response("binary", { headers: { "content-type": "application/pdf" } }));
    await expect(readWebPage({ url: page }, scope)).rejects.toMatchObject({ status: 415 });
  });
});
