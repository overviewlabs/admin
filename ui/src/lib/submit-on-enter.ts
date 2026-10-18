import type { KeyboardEvent } from "react";

/** Submit an answer field with Enter while leaving Shift+Enter for a new line. */
export function submitOnEnter(event: KeyboardEvent<HTMLElement>, submit: () => void) {
  if (
    event.key !== "Enter" || event.shiftKey || event.altKey ||
    event.repeat || event.nativeEvent.isComposing
  ) return;
  event.preventDefault();
  event.stopPropagation();
  submit();
}
