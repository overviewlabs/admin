import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, ExternalLink, Link2, Scissors, TextSelect, ClipboardPaste } from "lucide-react";
import { useLocation } from "@/lib/router";
import { useToastActions } from "@/context/ToastContext";
import { captureSiteContext, editContextSelection, restoreContextSelection, type SiteContext } from "@/lib/site-context";
import { DropdownMenu as ContextMenu, DropdownMenuContent as ContextMenuContent, DropdownMenuItem as ContextMenuItem, DropdownMenuTrigger as ContextMenuTrigger } from "./ui/dropdown-menu";

export function SiteContextMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [context, setContext] = useState<SiteContext | null>(null);
  const location = useLocation();
  const { pushToast } = useToastActions();
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const show = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      event.preventDefault();
      const rect = target?.getBoundingClientRect();
      setPoint({ x: event.clientX || rect?.left || 0, y: event.clientY || rect?.bottom || 0 });
      const captured = captureSiteContext(target);
      setContext(captured);
      // Suppress the browser menu on blank chrome; offer only relevant basics.
      setOpen(Boolean(captured.text || captured.editable || captured.selectable || captured.link || captured.image));
    };
    const close = (event: Event) => {
      if (event.type === "scroll" && event.target instanceof Element && event.target.closest('[data-site-context-menu]')) return;
      setOpen(false);
    };
    document.addEventListener("contextmenu", show);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("contextmenu", show);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
    };
  }, []);

  const fail = (error: unknown) => pushToast({ title: "Action unavailable", body: error instanceof Error ? error.message : "Please try again.", tone: "error" });
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); }
    catch { fail(new Error("Use your keyboard shortcut to copy; clipboard access was denied.")); }
  }
  async function paste() {
    if (!context?.editable) return;
    try { editContextSelection(context, await navigator.clipboard.readText()); }
    catch { fail(new Error("Use ⌘V or Ctrl+V to paste; your browser could not grant clipboard access.")); }
  }
  async function cut() {
    if (!context?.editable || !context.text) return;
    try { await navigator.clipboard.writeText(context.text); editContextSelection(context, ""); }
    catch (error) { fail(error); }
  }
  function selectAll() {
    if (!context) return;
    restoreContextSelection(context);
    const field = context.selectable;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.select();
    else {
      const surface = field || document.querySelector("#main-content,main");
      if (surface) { const range = document.createRange(); range.selectNodeContents(surface); getSelection()?.removeAllRanges(); getSelection()?.addRange(range); }
    }
  }
  return <>{children}<ContextMenu modal={false} open={open} onOpenChange={setOpen}>
    <ContextMenuTrigger asChild>
      <button aria-hidden="true" tabIndex={-1} className="whox-context-menu-anchor" style={{ left: point.x, top: point.y }} />
    </ContextMenuTrigger>
    <ContextMenuContent data-site-context-menu className="w-56 rounded-lg p-1.5" aria-label="Editing actions" align="start" sideOffset={0} onCloseAutoFocus={(event) => { event.preventDefault(); if (!openRef.current && context?.focusTarget?.isConnected) context.focusTarget.focus({ preventScroll: true }); }} onContextMenu={(event) => event.preventDefault()}>
      {context?.text && <ContextMenuItem onSelect={() => void copy(context.text)}><Copy /> Copy selection</ContextMenuItem>}
      {context?.editable && <>
        {context.text && <ContextMenuItem onSelect={() => void cut()}><Scissors /> Cut selection</ContextMenuItem>}
        <ContextMenuItem onSelect={() => void paste()}><ClipboardPaste /> Paste</ContextMenuItem>
      </>}
      {context?.selectable && <ContextMenuItem onSelect={selectAll}><TextSelect /> Select all</ContextMenuItem>}
      {context?.link && <>
        <ContextMenuItem onSelect={() => window.open(context.link!, "_blank", "noopener,noreferrer")}><ExternalLink /> Open link in new tab</ContextMenuItem>
        <ContextMenuItem onSelect={() => void copy(context.link!)}><Link2 /> Copy link address</ContextMenuItem>
      </>}
      {context?.image && <>
        <ContextMenuItem onSelect={() => window.open(context.image!, "_blank", "noopener,noreferrer")}><ExternalLink /> Open image in new tab</ContextMenuItem>
        <ContextMenuItem onSelect={() => void copy(context.image!)}><Copy /> Copy image address</ContextMenuItem>
      </>}
    </ContextMenuContent>
  </ContextMenu></>;
}
