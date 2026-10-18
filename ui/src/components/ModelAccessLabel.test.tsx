import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelAccessLabel } from "./ModelAccessLabel";

describe("model access badges", () => {
  it("shows a verified Daybreak badge alongside the model name", () => {
    const html = renderToStaticMarkup(<ModelAccessLabel label="GPT-6 Sol · Daybreak" />);
    expect(html).toContain('data-slot="badge"');
    expect(html).toContain("GPT-6 Sol");
    expect(html).toContain("Daybreak");
    expect(html).toContain('class="');
    expect(html).toContain("model-daybreak-badge");
    expect(html).not.toContain("Daybreak Blue");
    expect(html).not.toContain("access required");
  });
  it("does not present an unverified catalog entry as active", () => {
    const html = renderToStaticMarkup(<ModelAccessLabel label="gpt-6-sol" />);
    expect(html).toContain('data-variant="outline"');
    expect(html).toContain("access required");
    expect(html).not.toContain(" · ");
  });
  it("leaves other model names unchanged and adds no badge", () => {
    for (const label of ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna", "Claude Opus"])
      expect(renderToStaticMarkup(<ModelAccessLabel label={label} />)).toBe(label);
  });
});
