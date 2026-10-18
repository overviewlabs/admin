export type VoiceGrounding = {
  id: string;
  answer: string;
  suggestionsHtml: string[];
  sources: { uri: string; title: string; snippet?: string }[];
  /** Absent on legacy Google Live grounding. */
  provider?: "google" | "searxng" | "web";
  query?: string;
  category?: "general" | "images" | "videos" | "news";
  warnings?: string[];
};

const MAX_HTML_BYTES = 64 * 1024;
const encoder = new TextEncoder();

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Validate without rewriting the provider's direct destination URL. */
export function safeGroundingUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192
    || !/^https?:\/\//i.test(value)
    || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value)
    || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? value : null;
  } catch { return null; }
}

/** Grounding chunks are incremental; retain earlier citations in this answer only. */
export function mergeGroundingMetadata(
  previous: VoiceGrounding | null,
  metadata: unknown,
  id: string,
  answer: string,
): VoiceGrounding | null {
  const sameAnswer = previous?.id === id ? previous : null;
  const suggestionsHtml: string[] = [];
  let htmlBytes = 0;
  const appendHtml = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || suggestionsHtml.includes(value)
      || suggestionsHtml.length >= 4 || value.length > MAX_HTML_BYTES) return;
    const bytes = encoder.encode(value).length;
    if (htmlBytes + bytes > MAX_HTML_BYTES) return;
    suggestionsHtml.push(value);
    htmlBytes += bytes;
  };
  sameAnswer?.suggestionsHtml.forEach(appendHtml);

  const sources: VoiceGrounding["sources"] = [];
  const seen = new Set<string>();
  const appendSource = (value: unknown) => {
    const source = record(value);
    const uri = safeGroundingUrl(source?.uri);
    if (!uri || seen.has(uri) || sources.length >= 20) return;
    sources.push({ uri, title: (typeof source?.title === "string" ? source.title : uri).slice(0, 300) });
    seen.add(uri);
  };
  sameAnswer?.sources.forEach(appendSource);

  const data = record(metadata);
  const entry = record(data?.searchEntryPoint ?? data?.search_entry_point);
  appendHtml(entry?.renderedContent ?? entry?.rendered_content);
  const chunks = data?.groundingChunks ?? data?.grounding_chunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (sources.length >= 20) break;
      appendSource(record(chunk)?.web);
    }
  }
  if (!suggestionsHtml.length && !sources.length) return null;
  return { id, answer: answer.slice(0, 4000), suggestionsHtml, sources };
}

/** Project only displayable evidence from an authorized public-web tool result. */
export function mergeVoiceWebSources(
  previous: VoiceGrounding | null,
  result: unknown,
  id: string,
  action: "search_web" | "read_web_page",
): VoiceGrounding | null {
  const data = record(result);
  const provider = action === "search_web" ? "searxng" : "web";
  if (data?.provider !== provider) return null;
  // A new search replaces the old query. Page reads add evidence only to the
  // same spoken turn, never to a previous question or Google's suggestions.
  const prior = action === "read_web_page" && previous?.id === id
    && (previous.provider === "searxng" || previous.provider === "web") ? previous : null;
  const sources: VoiceGrounding["sources"] = [];
  const seen = new Set<string>();
  const append = (value: unknown) => {
    const source = record(value);
    const uri = safeGroundingUrl(source?.uri ?? source?.url);
    if (!uri || seen.has(uri) || sources.length >= 20) return;
    const snippet = typeof source?.snippet === "string" ? source.snippet.slice(0, 600) : undefined;
    sources.push({ uri, title: (typeof source?.title === "string" ? source.title : uri).slice(0, 300), ...(snippet ? { snippet } : {}) });
    seen.add(uri);
  };
  const appendArray = (value: unknown) => {
    if (Array.isArray(value)) for (const source of value.slice(0, 100)) append(source);
  };
  appendArray(prior?.sources);
  if (action === "search_web") appendArray(data.results);
  appendArray(data.sources);
  if (action === "read_web_page") append(data);
  const warnings = [...new Set([
    ...(prior?.warnings ?? []),
    ...(Array.isArray(data.warnings) ? data.warnings.slice(0, 3).filter((value): value is string => typeof value === "string").map(value => value.slice(0, 400)) : []),
  ])].slice(0, 3);
  return {
    id, answer: "", suggestionsHtml: [], sources, provider: prior?.provider ?? provider,
    ...(action === "search_web" ? { category: data.category === "images" || data.category === "videos" || data.category === "news" ? data.category : "general" as const } : prior?.category ? { category: prior.category } : {}),
    ...(typeof data.query === "string" ? { query: data.query.slice(0, 600) } : prior?.query ? { query: prior.query } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
const ALLOWED_ELEMENTS = new Set([
  "html", "head", "body", "style", "div", "span", "p", "a", "br", "hr", "img",
  "ul", "ol", "li", "strong", "em", "b", "i", "small", "sup", "sub", "section",
  "header", "footer", "main", "h1", "h2", "h3", "h4", "h5", "h6",
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "title", "desc",
]);
const ALLOWED_ATTRIBUTES = new Set([
  "class", "id", "style", "title", "role", "dir", "lang", "tabindex",
  "alt", "width", "height", "loading", "decoding", "viewbox", "xmlns",
  "d", "fill", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
  "opacity", "fill-opacity", "stroke-opacity", "transform", "cx", "cy", "r", "rx", "ry",
  "x", "y", "x1", "x2", "y1", "y2", "points", "preserveaspectratio",
]);

function imageUrl(value: string): string | null {
  const web = safeGroundingUrl(value);
  if (web && /^https:/i.test(web)) return web;
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value) ? value : null;
}

/**
 * Render only inside an iframe sandbox with allow-popups and
 * allow-popups-to-escape-sandbox, never allow-scripts or allow-same-origin.
 * Provider styles remain intact inside that isolated document.
 */
export function buildGroundingDocument(html: string): string {
  if (typeof document === "undefined") throw new Error("Grounding suggestions require a browser document.");
  const boundedHtml = html.length <= MAX_HTML_BYTES && encoder.encode(html).length <= MAX_HTML_BYTES ? html : "";
  const sandboxDocument = document.implementation.createHTMLDocument("");
  // Template contents are inert: unsafe images/frames cannot fetch during parsing.
  // Do not replace this with DOMParser on untrusted markup, which can load resources.
  const template = sandboxDocument.createElement("template");
  template.innerHTML = boundedHtml;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    const name = element.localName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(name)) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const key = attribute.name.toLowerCase();
      if (name === "a" && key === "href") {
        if (!safeGroundingUrl(attribute.value)) element.removeAttribute(attribute.name);
      } else if (name === "img" && key === "src") {
        if (!imageUrl(attribute.value)) element.removeAttribute(attribute.name);
      } else if (!ALLOWED_ATTRIBUTES.has(key) && !/^aria-[a-z-]+$/.test(key)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (name === "a" && element.hasAttribute("href")) {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }
  const policy = sandboxDocument.createElement("meta");
  policy.setAttribute("http-equiv", "Content-Security-Policy");
  policy.setAttribute("content", CSP);
  sandboxDocument.head.prepend(policy);
  const referrer = sandboxDocument.createElement("meta");
  referrer.name = "referrer";
  referrer.content = "no-referrer";
  sandboxDocument.head.append(referrer);
  // Only sanitized markup enters a document, after its policy has been installed.
  sandboxDocument.body.append(template.content);
  return "<!doctype html>" + sandboxDocument.documentElement.outerHTML;
}
