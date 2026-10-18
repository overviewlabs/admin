import {useEffect, useRef, useState} from "react";
import {parseCssTimeMs} from "../task-chat/motion-tokens";

/** Keep the unfinished statement out of the renderer. A partial array, image
 * URL or label must not temporarily replace the last complete component. */
export function completeStatements(source: string): string {
  let quoted = false, escaped = false, comment = false, depth = 0, end = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (comment) { if (char === "\n") { comment = false; if (depth === 0) end = i + 1; } }
    else if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === "/" && source[i + 1] === "/") comment = true;
    else if (char === '"') quoted = true;
    else if (char === "(" || char === "[" || char === "{") depth++;
    else if (")]}".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === "\n" && depth === 0) end = i + 1;
  }
  return source.slice(0, end);
}

/** Throttle, rather than debounce: continuous tokens still reveal useful
 * components promptly. One pending timer, no work while dormant, final flush. */
export function useStableStream(source: string, complete: boolean, visible: boolean) {
  const [shown, setShown] = useState(() => complete ? source : completeStatements(source));
  const latest = useRef(source); latest.current = source;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!visible || complete) {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      if (complete) setShown(source);
      return;
    }
    if (timer.current === null) {
      const interval = parseCssTimeMs(getComputedStyle(document.documentElement).getPropertyValue("--motion-duration-instant"));
      timer.current = setTimeout(() => {
        timer.current = null;
        setShown(completeStatements(latest.current));
      }, interval);
    }
  }, [source, complete, visible]);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  return complete ? source : shown;
}
