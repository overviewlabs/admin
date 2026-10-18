// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { buildGroundingDocument, mergeGroundingMetadata, mergeVoiceWebSources } from "./voice-grounding";

const chunk = (uri: string, title = "Source") => ({ web: { uri, title } });
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("authorized public-web evidence", () => {
  it.each(["general", "images", "videos", "news"])("retains the verified %s category without auto-loading optional media", category => {
    const value = mergeVoiceWebSources(null, { provider: "searxng", category, results: [{ url: "https://example.org", title: "Source", imageUrl: "https://external.org/image.jpg", thumbnailUrl: "https://external.org/thumb.jpg" }] }, "turn", "search_web")!;
    expect(value.category).toBe(category); expect(value.sources).toEqual([{ uri: "https://example.org", title: "Source" }]);
    expect(mergeVoiceWebSources(value, { provider: "web", url: "https://example.org/page" }, "turn", "read_web_page")?.category).toBe(category);
    expect(mergeVoiceWebSources(null, { provider: "searxng", category: "<script>bad</script>", results: [] }, "turn", "search_web")?.category).toBe("general");
  });
  it("keeps SearXNG result details, deduplicates citations, and adds page reads only to the same turn", () => {
    const search = mergeVoiceWebSources(null, { provider: "searxng", query: "release notes", results: [{ url: "https://example.org/release", title: "Release", snippet: "New release details" }], sources: [{ uri: "https://example.org/release", title: "Duplicate" }] }, "one", "search_web")!;
    expect(search).toMatchObject({ provider: "searxng", query: "release notes", suggestionsHtml: [], sources: [{ uri: "https://example.org/release", title: "Release", snippet: "New release details" }] });
    const page = { provider: "web", url: "https://example.org/page", title: "Page", text: "Long page contents must not be displayed as a spoken answer", sources: [{ uri: "https://example.org/page", title: "Page" }] };
    const combined = mergeVoiceWebSources(search, page, "one", "read_web_page")!;
    expect(combined.provider).toBe("searxng"); expect(combined.sources).toHaveLength(2); expect(combined.answer).toBe("");
    expect(search.sources).toHaveLength(1);
    const next = mergeVoiceWebSources(search, page, "two", "read_web_page")!;
    expect(next.provider).toBe("web"); expect(next.query).toBeUndefined(); expect(next.sources).toHaveLength(1);
    const empty = mergeVoiceWebSources(combined, { provider: "searxng", query: "another query", results: [] }, "one", "search_web")!;
    expect(empty.sources).toEqual([]); expect(empty.query).toBe("another query");
  });

  it("rejects unsafe links and wrong provider results, bounds untrusted arrays and display fields", () => {
    expect(mergeVoiceWebSources(null, { provider: "google", sources: [] }, "one", "search_web")).toBeNull();
    const invalid = Array.from({ length: 100 }, () => ({ url: "javascript:alert(1)", title: "Unsafe" }));
    const bounded = mergeVoiceWebSources(null, { provider: "searxng", query: "q".repeat(1000), results: [...invalid, { url: "https://example.org/too-late" }], sources: [{ uri: "https://name:pass@example.org" }, { uri: "https://example.org/source", title: "t".repeat(500), snippet: "s".repeat(1000) }], warnings: ["w".repeat(600), null, "Limited results", "not inspected"] }, "one", "search_web")!;
    expect(bounded.sources).toHaveLength(1); expect(bounded.sources[0].title).toHaveLength(300); expect(bounded.sources[0].snippet).toHaveLength(600);
    expect(bounded.query).toHaveLength(600); expect(bounded.warnings).toEqual(["w".repeat(400), "Limited results"]);
    const many = mergeVoiceWebSources(null, { provider: "searxng", results: Array.from({ length: 100 }, (_, index) => ({ url: `https://example.org/${index}` })) }, "one", "search_web")!;
    expect(many.sources).toHaveLength(20);
  });

  it("never carries legacy Google suggestions into a public-web tool card", () => {
    const legacy = mergeGroundingMetadata(null, { searchEntryPoint: { renderedContent: "<p>Google</p>" }, groundingChunks: [chunk("https://google.com")] }, "one", "Old answer");
    const current = mergeVoiceWebSources(legacy, { provider: "web", url: "https://example.org", title: "Read page" }, "one", "read_web_page")!;
    expect(current.sources).toEqual([{ uri: "https://example.org", title: "Read page" }]); expect(current.suggestionsHtml).toEqual([]); expect(current.answer).toBe("");
  });
});

describe("voice grounding accumulation", () => {
  it("appends incremental chunks and suggestions without duplicating either, accepting both provider field styles", () => {
    const first = mergeGroundingMetadata(null, {
      searchEntryPoint: { renderedContent: "<p>Search one</p>" },
      groundingChunks: [chunk("https://example.org/one")],
    }, "turn-1", "Partial");
    const next = mergeGroundingMetadata(first, {
      search_entry_point: { rendered_content: "<p>Search two</p>" },
      grounding_chunks: [chunk("https://example.org/one"), chunk("http://example.org/two")],
    }, "turn-1", "Complete answer");
    const repeated = mergeGroundingMetadata(next, {
      searchEntryPoint: { renderedContent: "<p>Search two</p>" },
    }, "turn-1", "Complete answer");
    expect(repeated).toEqual(next);
    expect(next?.suggestionsHtml).toEqual(["<p>Search one</p>", "<p>Search two</p>"]);
    expect(next?.sources.map(source => source.uri)).toEqual(["https://example.org/one", "http://example.org/two"]);
    expect(next?.answer).toBe("Complete answer");
    expect(first?.answer).toBe("Partial");
    expect(first?.sources).toHaveLength(1);
  });

  it("updates an answer without new metadata, but never leaks sources between turns", () => {
    const first = mergeGroundingMetadata(null, { groundingChunks: [chunk("https://example.org")] }, "one", "a");
    expect(mergeGroundingMetadata(first, undefined, "one", "done")?.answer).toBe("done");
    expect(mergeGroundingMetadata(first, undefined, "two", "new")).toBeNull();
    expect(mergeGroundingMetadata(null, { groundingChunks: [null, 1, {}, { web: "bad" }] }, "one", "a")).toBeNull();
  });

  it("rejects unsafe, relative, credentialed, whitespace and control-character source URLs", () => {
    const invalid = ["javascript:alert(1)", "data:text/html,hi", "/path", "//example.org", "https://user:pass@example.org",
      "https://user@example.org", "https://example.org/a b", "https://example.org/\npath", "https://example.org/\u0000",
      "https://example.org/%0a", "https://example.org\\@evil.org", "https://"];
    const value = mergeGroundingMetadata(null, { groundingChunks: [...invalid.map(uri => chunk(uri)), chunk("https://example.org/?q=one%20two")] }, "one", "a");
    expect(value?.sources).toEqual([{ uri: "https://example.org/?q=one%20two", title: "Source" }]);
  });

  it("caps source count, title and answer while keeping the first sources", () => {
    const value = mergeGroundingMetadata(null, { groundingChunks: Array.from({ length: 100 }, (_, i) => chunk(`https://example.org/${i}`, "T".repeat(500))) }, "one", "A".repeat(5000));
    expect(value?.sources).toHaveLength(20);
    expect(value?.sources.at(-1)?.uri).toBe("https://example.org/19");
    expect(value?.sources[0].title).toHaveLength(300);
    expect(value?.answer).toHaveLength(4000);
    const untitled = mergeGroundingMetadata(null, { groundingChunks: [{ web: { uri: "https://example.org/" + "x".repeat(1000) } }] }, "one", "a");
    expect(untitled?.sources[0].title).toHaveLength(300);
  });

  it("caps suggestions by count and UTF-8 bytes, without clipping provider HTML", () => {
    let value = null;
    for (let i = 0; i < 8; i++) value = mergeGroundingMetadata(value, { searchEntryPoint: { renderedContent: `<p>${i}</p>` } }, "one", "a");
    expect(value?.suggestionsHtml).toHaveLength(4);
    const large = mergeGroundingMetadata(null, { searchEntryPoint: { renderedContent: "😀".repeat(16_000) } }, "one", "a");
    const overflow = mergeGroundingMetadata(large, { searchEntryPoint: { renderedContent: "x".repeat(2000) } }, "one", "a");
    expect(overflow?.suggestionsHtml).toEqual(large?.suggestionsHtml);
    expect(mergeGroundingMetadata(null, { searchEntryPoint: { renderedContent: "😀".repeat(17_000) } }, "one", "a")).toBeNull();
  });
});

describe("sandboxed search suggestion document", () => {
  it("parses untrusted resource markup inside an inert template rather than DOMParser", () => {
    const parser = vi.spyOn(DOMParser.prototype, "parseFromString");
    try {
      const result = buildGroundingDocument('<iframe src="https://evil.org/private"></iframe><img src="javascript:alert(1)"><style>@import "https://evil.org/track";</style><a href="https://google.com/search?q=test">Search</a>');
      expect(parser).not.toHaveBeenCalled();
      const document = parse(result);
      expect(document.querySelector("iframe, img[src]")).toBeNull();
      expect(document.head.firstElementChild?.getAttribute("content")).toContain("default-src 'none'");
      expect(document.querySelector("a")?.textContent).toBe("Search");
    } finally { parser.mockRestore(); }
  });

  it("preserves provider HTML/styles, static SVG, and exact direct destinations with isolated popup behavior", () => {
    const stylesheet = ".suggestion { color: red; } @media (prefers-color-scheme: dark) { .suggestion { color: white; } }";
    const html = `<style>${stylesheet}</style><div class="suggestion"><a href="https://www.google.com/search?q=one%20two&amp;source=test" target="_top" rel="opener"><svg viewBox="0 0 10 10"><path d="M1 1 L9 9"/></svg>Search</a></div>`;
    const result = parse(buildGroundingDocument(html));
    expect(result.querySelector("style")?.textContent).toBe(stylesheet);
    expect(result.querySelector(".suggestion svg path")?.getAttribute("d")).toBe("M1 1 L9 9");
    const link = result.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://www.google.com/search?q=one%20two&source=test");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    const csp = result.head.firstElementChild;
    expect(csp?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(csp?.getAttribute("content")).toContain("default-src 'none'");
    expect(csp?.getAttribute("content")).toContain("form-action 'none'");
    expect(csp?.getAttribute("content")).not.toContain("script-src");
  });

  it("removes scripts, event handlers, forms, redirects, embedded documents and unsafe navigation", () => {
    const html = `<base href="https://evil.org" target="_top"><meta http-equiv="refresh" content="0;url=https://evil.org"><link rel="stylesheet" href="https://evil.org/a.css">
      <script>alert(1)</script><form action="https://evil.org"><input name="x"></form><iframe srcdoc="<script>alert(1)</script>"></iframe><object data="https://evil.org"></object>
      <svg onload="alert(1)"><foreignObject><iframe src="https://evil.org"></iframe></foreignObject><use href="https://evil.org/a.svg#x"/></svg>
      <div onclick="alert(1)" onpointerenter="alert(1)"><a href="java&#x0a;script:alert(1)" ping="https://evil.org" download="x">Unsafe</a>
      <a href="https://name:pass@evil.org">Credentials</a><a href="/relative">Relative</a></div>`;
    const result = parse(buildGroundingDocument(html));
    expect(result.querySelector("script,base,link,form,input,iframe,object,foreignObject,use")).toBeNull();
    expect(result.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(result.querySelector("[onclick],[onpointerenter],[onload],[ping],[download]")).toBeNull();
    expect(result.querySelectorAll("a[href]")).toHaveLength(0);
    expect(result.querySelector("div")?.textContent).toContain("Unsafe");
  });

  it("permits only safe image sources, removes srcsets/other URL attributes, and rejects oversized HTML", () => {
    const result = parse(buildGroundingDocument(`<img src="https://example.org/a.png" srcset="https://evil.org/b.png 2x" onerror="alert(1)">
      <img src="data:image/png;base64,YQ=="><img src="data:image/svg+xml,<svg onload='alert(1)'/>">
      <img src="http://example.org/a.png"><img src="https://user:pass@example.org/a.png"><div background="https://evil.org" srcdoc="x"></div>`));
    expect(Array.from(result.querySelectorAll("img[src]")).map(img => img.getAttribute("src"))).toEqual(["https://example.org/a.png", "data:image/png;base64,YQ=="]);
    expect(result.querySelector("[srcset],[onerror],[background],[srcdoc]")).toBeNull();
    expect(parse(buildGroundingDocument("😀".repeat(17_000))).body.textContent).toBe("");
  });
});
