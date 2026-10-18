// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureSiteContext, editContextSelection, safeContextUrl } from "./site-context";

afterEach(() => { document.body.replaceChildren(); getSelection()?.removeAllRanges(); vi.restoreAllMocks(); });
describe("site right-click context", () => {
  it("excludes password and explicitly private fields from clipboard context", () => {
    const input = document.createElement("input"); input.type = "password"; input.value = "private credential"; document.body.append(input); input.select();
    expect(captureSiteContext(input).text).toBe("");
    const privateText = document.createElement("p"); privateText.dataset.private = "true"; privateText.textContent = "private text"; document.body.append(privateText);
    const range = document.createRange(); range.selectNodeContents(privateText); getSelection()?.addRange(range);
    expect(captureSiteContext(privateText).text).toBe("");
  });
  it("keeps the entire clipboard selection", () => {
    const field = document.createElement("textarea"); field.value = "a".repeat(15_000); document.body.append(field); field.select();
    const context = captureSiteContext(field);
    expect(context.text.length).toBe(15_000);
  });
  it("only opens HTTP links", () => {
    expect(safeContextUrl("javascript:alert(1)")).toBeNull(); expect(safeContextUrl("data:text/html,secret")).toBeNull();
    expect(safeContextUrl("https://overviewlabs.ai/admin")).toBe("https://overviewlabs.ai/admin");

  });
  it("pastes at the captured selection and dispatches an input event", () => {
    const field = document.createElement("textarea"); field.value = "first middle last"; document.body.append(field); field.setSelectionRange(6,12);
    const context = captureSiteContext(field); const input = vi.fn(); field.addEventListener("input", input);
    editContextSelection(context, "new"); expect(field.value).toBe("first new last"); expect(field.selectionStart).toBe(9); expect(input).toHaveBeenCalledOnce();
  });
  it("keeps read-only fields immutable", () => {
    const field = document.createElement("input"); field.value = "immutable"; field.readOnly = true; document.body.append(field);
    const context = captureSiteContext(field); expect(context.editable).toBeNull(); expect(context.selectable).toBe(field); expect(() => editContextSelection(context,"change")).toThrow(); expect(field.value).toBe("immutable");
  });
});
