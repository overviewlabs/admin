// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BloubAgent, bloubStateForStatus } from "./BloubAgent";

describe("Bloub agent integration", () => {
  it.each([
    ["running", "thinking"], ["error", "alert"], ["paused", "sleep"],
    ["dormant", "sleep"], ["pending_approval", "notify"], ["alive", "idle"],
    ["queued", "notify"], ["awaiting_approval", "notify"],
    ["working", "orbit"], ["speaking", "play"], ["failed", "alert"],
  ])("maps %s to %s", (status, state) => {
    expect(bloubStateForStatus(status)).toBe(state);
  });
  it("keeps SVG masks distinct when several avatars share a page", () => {
    const html = renderToStaticMarkup(<><BloubAgent /><BloubAgent /><BloubAgent status="running" /></>);
    const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
    expect(html).toContain('data-bloub-state="thinking"');
    expect(html).toContain('aria-hidden="true"');
  });
  it("honors explicit SVG dimensions in timeline renderers", () => {
    const html = renderToStaticMarkup(<BloubAgent width={13} height={13} />);
    expect(html).not.toContain('size-4');
    expect(html).toContain('width="13"');
  });
});

it("keeps a saved avatar color across status changes and gives variants distinct colors", () => {
  const idle = renderToStaticMarkup(<BloubAgent variant="cpu" />);
  const running = renderToStaticMarkup(<BloubAgent variant="cpu" status="running" />);
  const mint = renderToStaticMarkup(<BloubAgent variant="bot" />);
  expect(idle).toContain('data-bloub-color="rose"');
  expect(running).toContain('data-bloub-color="rose"');
  expect(mint).toContain('data-bloub-color="mint"');
  expect(idle).toContain('<linearGradient');
});
