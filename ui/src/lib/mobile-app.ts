// Keep text entry stable without disabling the user's pinch-to-zoom gesture.
export function startMobileViewport() {
  const root = document.documentElement;
  let frame = 0;
  let baselineHeight = window.innerHeight;
  let lastWidth = window.innerWidth;
  let observedDock: Element | undefined;
  const sizeObserver = new ResizeObserver(() => update());
  const update = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const viewport = window.visualViewport;
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      const height = viewport?.height ?? window.innerHeight;
      const top = Math.max(0, viewport?.offsetTop ?? 0);
      const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
      if (lastWidth !== window.innerWidth) baselineHeight = layoutHeight;
      lastWidth = window.innerWidth;
      baselineHeight = Math.max(baselineHeight, layoutHeight, height);
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (active.isContentEditable || active.matches("input, textarea, [role='textbox']"));
      root.style.setProperty("--app-visible-height", `${height}px`);
      root.style.setProperty("--app-visible-top", `${top}px`);
      root.style.setProperty("--app-keyboard-inset", `${Math.max(0, layoutHeight - height - top)}px`);
      root.dataset.keyboardOpen = String(layoutHeight - height > 120 || (editing && baselineHeight - height > 120));
      const dock = Array.from(document.querySelectorAll("[data-chat-composer-dock]")).find((element) => element.getBoundingClientRect().height > 0 && element.getBoundingClientRect().width > 0);
      if (dock !== observedDock) {
        sizeObserver.disconnect();
        if (dock) sizeObserver.observe(dock);
        observedDock = dock;
      }
      root.dataset.mobileChatComposer = String(Boolean(dock));
      root.style.setProperty("--app-composer-height", `${dock?.getBoundingClientRect().height ?? 0}px`);
      if (dock) {
        const pane = dock.closest("#main-content")?.getBoundingClientRect();
        if (pane) {
          const maxWidth = parseFloat(getComputedStyle(dock).maxWidth) || pane.width;
          const width = Math.min(pane.width, maxWidth);
          root.style.setProperty("--app-composer-width", `${width}px`);
          root.style.setProperty("--app-composer-left", `${pane.left + (pane.width - width) / 2}px`);
        }
      }
    });
  };
  const mutations = new MutationObserver(update);
  mutations.observe(document.body, { childList: true, subtree: true });
  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", update);
  update();
  return () => {
    cancelAnimationFrame(frame);
    sizeObserver.disconnect();
    mutations.disconnect();
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    document.removeEventListener("focusin", update);
    document.removeEventListener("focusout", update);
  };
}
export function openInstallApp() {
  window.dispatchEvent(new Event("overview-install-app"));
}
