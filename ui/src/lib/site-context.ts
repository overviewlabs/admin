export type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
export interface SiteContext {
  text: string;
  link: string | null;
  image: string | null;
  editable: EditableTarget | null;
  selectable: EditableTarget | null;
  start: number | null;
  end: number | null;
  range: Range | null;
  focusTarget: HTMLElement | null;
}

export function safeContextUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, location.href);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function captureSiteContext(target: Element | null): SiteContext {
  const field = target?.closest("input,textarea");
  const input = field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement && ["text", "search", "email", "tel", "url", "number", "password"].includes(field.type) ? field : null;
  const editable = input || target?.closest<HTMLElement>("[contenteditable='true'],[contenteditable='plaintext-only']") || null;
  const selection = getSelection();
  const password = field instanceof HTMLInputElement && field.type === "password";
  const protectedField = password || Boolean(target?.closest("[data-private],[data-sensitive]"));
  const text = protectedField ? "" : input ? input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0) : selection?.toString() || "";
  return {
    text,
    link: safeContextUrl(target?.closest<HTMLAnchorElement>("a[href]")?.href || null),
    image: safeContextUrl(target?.closest<HTMLImageElement>("img")?.currentSrc || null),
    editable: editable && !("readOnly" in editable && editable.readOnly) && !("disabled" in editable && editable.disabled) ? editable : null,
    selectable: editable,
    start: input?.selectionStart ?? null, end: input?.selectionEnd ?? null,
    range: !protectedField && selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null,
    focusTarget: target?.closest<HTMLElement>("button,a[href],input,textarea,[tabindex]") || (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null),
  };
}

export function restoreContextSelection(context: SiteContext) {
  const field = context.editable;
  if (field?.isConnected) {
    field.focus();
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      if (context.start !== null && context.end !== null) field.setSelectionRange(context.start, context.end);
      return;
    }
  }
  if (context.range?.startContainer.isConnected) {
    const selection = getSelection();
    selection?.removeAllRanges(); selection?.addRange(context.range);
  }
}

/** Dispatch an actual input event so controlled React fields receive the edit. */
export function editContextSelection(context: SiteContext, text: string) {
  const field = context.editable;
  if (!field?.isConnected) throw new Error("The text field is no longer available.");
  restoreContextSelection(context);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    if (field.selectionStart === null) {
      if (!document.execCommand("insertText", false, text)) throw new Error("Use your keyboard shortcut to edit this field.");
      return;
    }
    const start = context.start ?? field.value.length;
    const end = context.end ?? start;
    const value = field.value.slice(0, start) + text + field.value.slice(end);
    const prototype = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
    field.setSelectionRange(start + text.length, start + text.length);
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: text ? "insertText" : "deleteContent", data: text }));
  } else if (!document.execCommand("insertText", false, text)) {
    throw new Error("Use your keyboard shortcut to edit this field.");
  }
}

