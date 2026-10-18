import { readThreadScrollAnchor, threadScrollAnchorDelta, type ThreadScrollAnchor } from "./scroll-anchor";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useTaskChatScrollNavigation } from "./scroll-navigation";
import { shouldFollowChatScroll } from "@/lib/chat-scroll-follower";

const PIN_THRESHOLD_PX = 48;

function scrollingElement(): Element | null {
  return document.scrollingElement ?? document.documentElement;
}

function windowPinned(): boolean {
  const el = scrollingElement();
  if (!el) return true;
  return el.scrollHeight - window.scrollY - window.innerHeight <= PIN_THRESHOLD_PX;
}

function scrollWindowToBottom(): void {
  const el = scrollingElement();
  if (!el) return;
  window.scrollTo({ top: el.scrollHeight, left: 0, behavior: "auto" });
}

/**
 * Window-scroll counterpart of TaskMessageScroller's auto-follow rule, for the
 * mobile document-flow thread (the mobile app shell scrolls the document, not
 * an inner viewport — see Layout.tsx). While the window is pinned to the
 * bottom (within a small threshold) content growth follows with INSTANT
 * scroll; once the user scrolls up we hold their position.
 *
 * The conversation enables this hook after navigation has settled and before
 * its coordinated reveal, so initial positioning happens before paint.
 */
export function useWindowAutoFollow(contentKey: unknown, enabled: boolean): void {
  const pinnedRef = useRef(true);
  const previousTopRef = useRef(0);
  const navigation = useTaskChatScrollNavigation();
  const initialPositionApplied = useRef(false);
  const appliedNavigation = useRef({ key: navigation.key, hash: navigation.hash });
  const anchorRef = useRef<ThreadScrollAnchor | null>(null);
  const rememberAnchor = () => {
    const root = document.querySelector('[data-testid="task-chat-thread"]');
    if (root) anchorRef.current = readThreadScrollAnchor(root, 0, window.innerHeight);
    if (initialPositionApplied.current) navigation.remember(window.scrollY, anchorRef.current);
  };
  const reconcile = () => {
    if (pinnedRef.current) scrollWindowToBottom();
    else {
      const root = document.querySelector('[data-testid="task-chat-thread"]');
      if (root) {
        const delta = threadScrollAnchorDelta(root, anchorRef.current, 0);
        if (delta) window.scrollTo({ top: window.scrollY + delta, behavior: "auto" });
      }
    }
    rememberAnchor();
    previousTopRef.current = window.scrollY;
  };

  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => {
      const el = scrollingElement();
      pinnedRef.current = shouldFollowChatScroll(pinnedRef.current, previousTopRef.current, window.scrollY, el ? el.scrollHeight - window.scrollY - window.innerHeight : 0, PIN_THRESHOLD_PX);
      previousTopRef.current = window.scrollY;
      rememberAnchor();
    };
    const pause = (event: Event) => {
      if (event.type === "wheel" && (event as WheelEvent).deltaY >= 0) return;
      pinnedRef.current = false;
    };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')) return;
      if ((["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey))) pause(event);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", pause, { passive: true });
    window.addEventListener("touchstart", pause, { passive: true });
    window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("wheel", pause); window.removeEventListener("touchstart", pause); window.removeEventListener("keydown", keyboard); };
  }, [enabled, navigation.key, navigation.hash, navigation.ready]);

  useLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === "undefined") return;
    const observed = document.body;
    let previousScrollHeight = scrollingElement()?.scrollHeight ?? null;
    const observer = new ResizeObserver(() => {
      const nextScrollHeight = scrollingElement()?.scrollHeight ?? null;
      if (
        nextScrollHeight == null ||
        nextScrollHeight === previousScrollHeight
      ) {
        return;
      }
      previousScrollHeight = nextScrollHeight;
      reconcile();
    });
    observer.observe(observed);
    return () => observer.disconnect();
  }, [enabled, navigation.key, navigation.hash, navigation.ready]);

  // Follow new content only when already pinned; otherwise hold position.
  useLayoutEffect(() => {
    if (!enabled) return;
    if (appliedNavigation.current.key !== navigation.key || appliedNavigation.current.hash !== navigation.hash) {
      appliedNavigation.current = { key: navigation.key, hash: navigation.hash };
      initialPositionApplied.current = false;
    }
    if (navigation.ready && !initialPositionApplied.current) {
      const root = document.querySelector('[data-testid="task-chat-thread"]');
      const top = root ? navigation.initialPosition(root, 0, window.scrollY) : null;
      if (top !== null) {
        window.scrollTo({ top, behavior: "auto" });
        pinnedRef.current = windowPinned();
        rememberAnchor();
      }
      initialPositionApplied.current = true;
    }
    reconcile();
  }, [contentKey, enabled, navigation.key, navigation.hash, navigation.ready]);

  useLayoutEffect(() => {
    if (!enabled) return;
    // One owner for document-flow compensation, as on the desktop viewport.
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    document.documentElement.classList.add("task-chat-window-scroll");
    return () => {
      document.documentElement.classList.remove("task-chat-window-scroll");
      window.history.scrollRestoration = previousRestoration;
    };
  }, [enabled]);
}

/** Mount below TaskChatScrollReady so mobile navigation also waits for targets
 * fetched after the conversation's first reveal. */
export function TaskChatWindowScroll({ contentKey, enabled }: { contentKey: unknown; enabled: boolean }) {
  useWindowAutoFollow(contentKey, enabled);
  return null;
}
