import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { buildGroundingDocument, safeGroundingUrl, type VoiceGrounding } from "@/lib/voice-grounding";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

/** Provider search suggestions remain isolated from the application's document. */
export function VoiceSearchCard({ grounding }: { grounding: VoiceGrounding }) {
  const [expanded, setExpanded] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const publicWeb = grounding.provider === "searxng" || grounding.provider === "web";
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setExpanded(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setExpanded(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [expanded]);
  const documents = useMemo(() => grounding.suggestionsHtml.map(buildGroundingDocument), [grounding.suggestionsHtml]);
  const sources = grounding.sources.filter(source => safeGroundingUrl(source.uri));
  const title = grounding.provider === "searxng" ? "Web search · SearXNG" : grounding.provider === "web" ? "Public web sources" : "Google Search";
  const category = grounding.category ? { general: "General", images: "Images", videos: "Videos", news: "News" }[grounding.category] : undefined;
  return <div ref={container} className="global-voice-sources">
    {publicWeb && <Button ref={trigger} variant="ghost" size="xs" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
      <Link2 aria-hidden="true" />Sources ({sources.length}){expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
    </Button>}
    {(!publicWeb || expanded) && <Card id={panelId} className="global-voice-search-card gap-3 py-4" role="region" aria-label={`${title} results for this voice answer`}>
    <CardHeader className="px-4"><CardTitle className="text-sm">{title}{category && <span className="ml-2 font-normal text-muted-foreground">{category}</span>}</CardTitle></CardHeader>
    <CardContent className="flex flex-col gap-3 px-4">
      {grounding.query && <p className="text-xs text-muted-foreground">{grounding.query}</p>}
      {grounding.answer && <p className="whitespace-pre-wrap text-sm">{grounding.answer}</p>}
      {documents.map((document, index) => <iframe key={index} title={`Google Search suggestions ${index + 1}`} className="voice-search-suggestions w-full border-0"
        sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={document} />)}
      {sources.length > 0 && <ul className="flex flex-col gap-2 text-xs">
        {sources.map(source => <li key={source.uri}><a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">{source.title || new URL(source.uri).hostname}</a>
          {source.snippet && <p className="mt-1 text-muted-foreground">{source.snippet}</p>}
        </li>)}
      </ul>}
      {!sources.length && grounding.provider === "searxng" && <p className="text-xs text-muted-foreground">No web results found.</p>}
      {grounding.warnings?.map((warning, index) => <p key={index} className="text-xs text-muted-foreground">{warning}</p>)}
    </CardContent>
  </Card>}
  </div>;
}
