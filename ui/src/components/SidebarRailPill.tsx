import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const RAIL_PILL_ENTER = "overviewlabs:rail-pill-enter";

/** One interactive pill, animated from the existing icon's exact position. */
export function useSidebarRailPill(label: string, enabled: boolean, icon: ReactNode) {
  const owner = useRef(Symbol("rail-pill"));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(36);
  const pillRef = useRef<HTMLSpanElement>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (removeTimer.current) clearTimeout(removeTimer.current);
  };
  useLayoutEffect(() => {
    cancelClose();
    setExpanded(false);
    setAnchor(null);
  }, [enabled]);
  useLayoutEffect(() => {
    if (!anchor || !enabled || !pillRef.current) return;
    const labelElement = pillRef.current.querySelector<HTMLElement>(".whox-rail-pill-label");
    setWidth(Math.max(anchor.getBoundingClientRect().width, (labelElement?.scrollWidth ?? 0) + 48));
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setExpanded(true));
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); };
  }, [anchor, enabled, label]);
  useEffect(() => {
    const dismiss = () => { cancelClose(); setExpanded(false); setAnchor(null); };
    const dismissPrevious = (event: Event) => {
      if ((event as CustomEvent).detail !== owner.current) dismiss();
    };
    window.addEventListener(RAIL_PILL_ENTER, dismissPrevious);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      cancelClose();
      window.removeEventListener(RAIL_PILL_ENTER, dismissPrevious);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  const show = (element: HTMLElement) => {
    if (!enabled) return;
    window.dispatchEvent(new CustomEvent(RAIL_PILL_ENTER, { detail: owner.current }));
    cancelClose();
    if (anchor === element) { setExpanded(true); return; }
    setExpanded(false);
    setAnchor(element);
  };
  const hide = (event?: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const next = event?.relatedTarget;
    if (next instanceof Node && (anchor?.contains(next) || pillRef.current?.contains(next))) return;
    cancelClose();
    setExpanded(false);
    removeTimer.current = setTimeout(() => setAnchor(null), 250);
  };
  const pill = enabled && anchor && typeof document !== "undefined"
    ? createPortal(
        <span
          ref={pillRef}
          data-slot="sidebar-rail-pill"
          aria-hidden="true"
          className="whox-rail-pill"
          data-expanded={expanded ? "true" : undefined}
          data-active={anchor.classList.contains("whox-nav-item-active") ? "true" : undefined}
          style={{ left: anchor.getBoundingClientRect().left, top: anchor.getBoundingClientRect().top,
            width: expanded ? width : anchor.getBoundingClientRect().width }}
          onMouseEnter={() => { cancelClose(); setExpanded(true); }}
          onMouseLeave={hide}
          onClick={() => { anchor.click(); cancelClose(); setAnchor(null); }}
        >
          <span className="whox-rail-pill-icon">{icon}</span>
          <span className="whox-rail-pill-label">{label}</span>
        </span>,
        document.body,
      )
    : null;
  return {
    onMouseEnter: (event: MouseEvent<HTMLElement>) => show(event.currentTarget),
    onMouseLeave: hide,
    onFocus: (event: FocusEvent<HTMLElement>) => show(event.currentTarget),
    onBlur: hide,
    pill,
  };
}
