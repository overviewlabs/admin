import {useCallback, useLayoutEffect, useRef, useState, type RefObject} from "react";
import {createChatScrollFollower, shouldFollowChatScroll} from "@/lib/chat-scroll-follower";

/** Event-driven following, including late images and async component layouts.
 * User scrolling wins; no timers or frames remain running after settling. */
export function useChatFollow(ref: RefObject<HTMLDivElement | null>, contentKey: unknown, resetKey?: string | null) {
  const follower = useRef<ReturnType<typeof createChatScrollFollower> | null>(null);
  const pinned = useRef(true), initial = useRef(true);
  const previousTop = useRef(0);
  const [away, setAway] = useState(false);
  const onScroll = useCallback(() => {
    const el = ref.current, motion = follower.current; if (!el) return;
    if ((motion?.active || pinned.current) && motion?.ownsPosition()) { previousTop.current = el.scrollTop; return; }
    motion?.cancel();
    pinned.current = shouldFollowChatScroll(pinned.current, previousTop.current, el.scrollTop, el.scrollHeight - el.scrollTop - el.clientHeight, 100);
    previousTop.current = el.scrollTop;
    el.dataset.following = String(pinned.current);
    setAway(!pinned.current);
  }, [ref]);
  const resume = useCallback(() => { pinned.current = true; setAway(false); if (ref.current) ref.current.dataset.following = "true"; follower.current?.follow(); }, [ref]);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    pinned.current = true; initial.current = true; setAway(false); el.dataset.following = "true";
    previousTop.current = el.scrollTop;
    const motion = createChatScrollFollower(el); follower.current = motion;
    const follow = () => { if (pinned.current) motion.follow(initial.current); };
    const gesture = (event?: Event) => {
      if (event?.type === "wheel" && (event as WheelEvent).deltaY >= 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 100) return;
      motion.cancel(); pinned.current = false; el.dataset.following = "false";
      setAway(true);
    };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')) return;
      if ((["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey))) gesture();
    };
    const visibility = () => { if (document.visibilityState === "hidden") motion.cancel(); else follow(); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(follow);
    observer?.observe(el); if (el.firstElementChild) observer?.observe(el.firstElementChild);
    el.addEventListener("wheel", gesture, {passive:true}); el.addEventListener("touchstart", gesture, {passive:true}); el.addEventListener("keydown", keyboard);
    document.addEventListener("visibilitychange", visibility);
    return () => { motion.cancel(); observer?.disconnect(); el.removeEventListener("wheel", gesture); el.removeEventListener("touchstart", gesture); el.removeEventListener("keydown", keyboard); document.removeEventListener("visibilitychange", visibility); follower.current = null; };
  }, [ref, resetKey, Boolean(contentKey)]);
  useLayoutEffect(() => {
    if (contentKey == null) return;
    if (pinned.current) follower.current?.follow(initial.current);
    initial.current = false;
  }, [contentKey, resetKey]);
  return {away, onScroll, resume};
}
