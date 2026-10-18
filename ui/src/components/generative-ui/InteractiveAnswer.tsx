import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Renderer, BuiltinActionType, type ActionEvent, type OpenUIError, type ParseResult } from "@openuidev/react-lang";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { prepareGenerativeFollowup } from "@/lib/generative-followup";
import { library } from "./library";
import { allowedLink, sourceError } from "./schema";
import {MediaActivityContext} from "./media-activity";

function completionError(result: ParseResult | null): string | null {
  if (!result) return null;
  if (result.meta.unresolved.length) return "Some visual components are missing. Ask the agent to finish this interface.";
  if (!result.root || (Array.isArray(result.root.props.children) && !result.root.props.children.some(Boolean))) return "This answer has no displayable components. Ask the agent to recreate it.";
  return null;
}

function useVisible(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current; if (!element) return;
    let inView = false;
    const update = () => {
      const next = inView && document.visibilityState !== "hidden";
      setVisible(next);
    };
    const observer = new IntersectionObserver(entries => { inView = Boolean(entries[0]?.isIntersecting); update(); });
    observer.observe(element); document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [ref]);
  return visible;
}

/** OpenUI Lang is data evaluated against trusted React components. No model
 * HTML, JSX or JavaScript is executed in the host, and no browser tools are
 * registered. The existing transport supplies the accumulating text directly. */
export const InteractiveAnswer = memo(function InteractiveAnswer({source, complete = true, legacy = false}: {source: string; complete?: boolean; legacy?: boolean}) {
  const root = useRef<HTMLDivElement>(null), state = useRef<Record<string, unknown>>({});
  const visible = useVisible(root), {theme} = useTheme();
  // Keep an activated renderer mounted. Unmounting at an intersection boundary
  // replaced tall cards with short placeholders, then expanded them on return.
  // Streaming and media remain dormant offscreen without changing geometry.
  const activated = useRef(false);
  if (visible) activated.current = true;
  const [playing,setPlaying]=useState<Set<string>>(()=>new Set());
  const onPlayback=useCallback((id:string,active:boolean)=>setPlaying(previous=>{
    if(previous.has(id)===active)return previous;
    const next=new Set(previous);if(active)next.add(id);else next.delete(id);return next;
  }),[]);
  const limitError = sourceError(source);
  // Mount only the completed program. Partial UI is neither parsed nor painted.
  const response = source;
  const hasStreamed = useRef(!complete);
  if (!complete) hasStreamed.current = true;
  else if (!visible) hasStreamed.current = false; // History must not fade again on return.
  const [error, setError] = useState<string | null>(null), [actionError, setActionError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const parsed = useRef<ParseResult | null>(null);
  const current = useRef({complete}); current.current = {complete};
  const onStateUpdate = useCallback((next: Record<string, unknown>) => { state.current = next; }, []);
  const onParseResult = useCallback((result: ParseResult | null) => {
    parsed.current = result;
    setValidationError(current.current.complete ? completionError(result) : null);
  }, []);
  useEffect(() => { setValidationError(complete && response === source ? completionError(parsed.current) : null); }, [complete, response, source]);
  const onError = useCallback((errors: OpenUIError[]) => {
    // Incomplete references are expected during streaming; report final errors.
    if (!current.current.complete) return;
    setError(errors.length ? "Part of this interface could not render. Ask the agent to correct it." : null);
  }, []);
  const onAction = useCallback((event: ActionEvent) => {
    try {
      if (event.type === BuiltinActionType.ContinueConversation) {
        const values = event.formState && Object.keys(event.formState).length ? `\n\nSelected values: ${JSON.stringify(event.formState)}` : "";
        const context = typeof event.params?.context === "string" && event.params.context.trim() ? `\n\n${event.params.context.trim()}` : "";
        const text = (event.humanFriendlyMessage?.trim() || "") + context + values;
        if (!text || text.length > 4000) throw Error("Use a follow-up of at most 4000 characters.");
        prepareGenerativeFollowup(root.current!, text);
      } else if (event.type === BuiltinActionType.OpenUrl) {
        const url = allowedLink(event.params);
        if (!url) throw Error("Only HTTPS links without embedded credentials are supported.");
        window.open(url, "_blank", "noopener,noreferrer");
      } else throw Error("This action is unavailable. Ask the agent in the conversation instead.");
      setActionError(null);
    } catch (err) { setActionError(err instanceof Error ? err.message : "Could not prepare this action."); }
  }, []);
  function recreate() {
    try { prepareGenerativeFollowup(root.current!, "Recreate the previous interactive visual using the current OpenUI components, preserving its inputs, calculations and example data."); setActionError(null); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Could not prepare the follow-up."); }
  }
  const renderError = validationError || error;
  return <section ref={root} className="interactive-answer openui-answer not-prose" aria-label="Interactive answer" data-testid="interactive-answer" data-theme={theme} data-animate={hasStreamed.current} data-visible={visible} data-ready={complete}>
    {legacy ? <div className="space-y-2 py-3">
      <p className="text-sm text-muted-foreground">This saved visual uses the previous format. Recreate it to use OpenUI.</p>
      <Button size="sm" variant="outline" onClick={recreate}>Recreate interactive answer</Button>
      <details className="text-xs text-muted-foreground"><summary>Saved visual source</summary><pre className="max-h-48 overflow-auto">{source}</pre></details>
    </div> : limitError ? <p role="alert" className="text-sm text-destructive">{limitError}</p> : complete && (activated.current || playing.size>0) ? <div className="openui-finished-answer"><div className="openui-stream-content">
      <MediaActivityContext.Provider value={onPlayback}><Renderer response={response} library={library} isStreaming={false} initialState={state.current}
        onStateUpdate={onStateUpdate} onAction={onAction} onParseResult={onParseResult} onError={onError} toolProvider={null}/></MediaActivityContext.Provider>
      {renderError ? <div className="space-y-2 py-2"><p role="alert" className="text-sm text-destructive">{renderError}</p><Button size="sm" variant="outline" onClick={recreate}>Recreate interactive answer</Button></div> : null}
    </div></div> : null}
    {actionError ? <p role="alert" className="mt-2 text-sm text-destructive">{actionError}</p> : null}
  </section>;
});
