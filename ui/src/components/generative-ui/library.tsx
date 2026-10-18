import { createLibrary, parseStructuredRules, useFormValidation, useIsStreaming, useStateField, type ComponentRenderProps, type ElementNode } from "@openuidev/react-lang";
import { Calendar, openuiLibrary } from "@openuidev/react-ui";
import { ChatImage } from "@/components/ChatImage";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { imageSource } from "./schema";
import {richComponents} from "./rich-components";

type GalleryImage = {src: string; alt?: string; details?: string};
const NativeStack = openuiLibrary.components.Stack.component;
function RevealStack({props, renderNode, statementId}: ComponentRenderProps) {
  return <div className="openui-layout" data-direction={props.direction || "column"}>
    <NativeStack props={props} statementId={statementId} renderNode={statementId !== "root" ? renderNode : children =>
    Array.isArray(children) ? children.map((child, index) => child == null ? null :
      <div className="openui-reveal min-w-0 max-w-full" key={`${(child as ElementNode)?.statementId || "inline"}:${index}`}>{renderNode(child)}</div>) : renderNode(children)}/>
  </div>;
}
const NativeCard = openuiLibrary.components.Card.component;
function ResponsiveCard(props: ComponentRenderProps) {
  return <div className="openui-layout" data-direction={props.props.direction || "column"}><NativeCard {...props}/></div>;
}
function ResponsiveModal({props, renderNode}: ComponentRenderProps) {
  const field = useStateField("open", props.open);
  return <Dialog open={field.value === true || field.value === "true"} onOpenChange={open=>{if (!open) field.setValue(false);}}>
    <DialogContent className="openui-answer openui-dialog" data-size={props.size || "md"} aria-describedby={undefined}>
      <DialogTitle>{props.title as string}</DialogTitle>
      <div className="openui-dialog-body">{renderNode(props.children)}</div>
    </DialogContent>
  </Dialog>;
}
function ResponsiveDatePicker({props}: ComponentRenderProps) {
  const [open, setOpen] = useState(false);
  const field = useStateField(props.name as string, props.value);
  const streaming = useIsStreaming(), validation = useFormValidation();
  const rules = useMemo(()=>parseStructuredRules(props.rules), [props.rules]);
  useEffect(()=>{
    if (streaming || !rules.length || !validation) return;
    validation.registerField(field.name, rules, ()=>field.value);
    return ()=>validation.unregisterField(field.name);
  }, [streaming, validation, field.name, field.value, rules]);
  const asDate = (value: unknown) => {
    if (value == null) return undefined;
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : undefined;
    return date && !Number.isNaN(date.getTime()) ? date : undefined;
  };
  const range = props.mode === "range";
  const value = field.value as {from?: unknown; to?: unknown} | undefined;
  const from = range ? asDate(value?.from) : asDate(field.value), to = range ? asDate(value?.to) : undefined;
  const label = from ? from.toLocaleDateString() + (range ? ` – ${to?.toLocaleDateString() || "Select end date"}` : "") : "Select date";
  function select(next: unknown) { field.setValue(next); if (rules.length) validation?.validateField(field.name, next, rules); }
  return <>
    <Button id={props.name as string} type="button" variant="outline" className="w-full justify-start whitespace-normal text-left" disabled={streaming} onClick={()=>setOpen(true)} aria-haspopup="dialog">{label}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="openui-answer openui-dialog" data-size="sm" aria-describedby={undefined}>
        <DialogTitle>{range ? "Select date range" : "Select date"}</DialogTitle>
        {range ? <Calendar mode="range" selected={from ? {from, to} : undefined} onSelect={select} startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)}/>
          : <Calendar mode="single" selected={from} onSelect={select} startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)}/>}
        <Button type="button" variant="outline" onClick={()=>setOpen(false)}>Done</Button>
      </DialogContent>
    </Dialog>
  </>;
}
function ImageGallery({props}: {props: {images?: GalleryImage[]}}) {
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  return <>
    <div className="openui-gallery grid grid-cols-1 gap-3">
      {(props.images || []).map((image, index) => <figure key={index} className="min-w-0 space-y-2">
        {imageSource(image.src) ? <button type="button" className="block w-full text-left" aria-label={`Open ${image.alt || "image"}`} onClick={()=>setSelected(image)}>
          <ChatImage src={imageSource(image.src)!} alt={image.alt || ""} retryable={false} loading="lazy" containerClassName="openui-image-frame" className="max-w-full rounded-lg"/>
        </button> : <p className="text-sm text-muted-foreground">Image unavailable</p>}
        {image.details ? <figcaption className="text-xs text-muted-foreground">{image.details}</figcaption> : null}
      </figure>)}
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null);}}>
      <DialogContent className="openui-answer openui-dialog" data-size="lg">
        <DialogTitle>{selected?.alt || "Image preview"}</DialogTitle>
        <DialogDescription>{selected?.details || "Full-size image"}</DialogDescription>
        {selected && imageSource(selected.src) ? <ChatImage src={imageSource(selected.src)!} alt={selected.alt || ""} className="openui-dialog-image max-w-full rounded-lg"/> : null}
      </DialogContent>
    </Dialog>
  </>;
}

// Use OpenUI's complete native component library. Image components share the
// site's cache restoration, loading, fallback and retry presentation.
const components = Object.values(openuiLibrary.components).map(component => {
  if (component.name === "Stack") return {...component, component: RevealStack};
  if (component.name === "Card") return {...component, component: ResponsiveCard};
  if (component.name === "Modal") return {...component, component: ResponsiveModal};
  if (component.name === "DatePicker") return {...component, component: ResponsiveDatePicker};
  if (component.name === "Image" || component.name === "ImageBlock") return {
    ...component,
    component: ({ props }: { props: { src?: string; alt?: string } }) => {
      const src = imageSource(props.src);
      return src ? <ChatImage src={src} alt={props.alt || ""} loading="lazy" containerClassName="openui-image-frame" className="max-w-full rounded-lg"/>
        : <p className="text-sm text-muted-foreground">Image unavailable</p>;
    },
  };
  if (component.name === "ImageGallery") return {
    ...component,
    component: ImageGallery,
  };
  return component;
});
export const library = createLibrary({ root: "Stack", components:[...components,...richComponents],
  componentGroups: [...(openuiLibrary.componentGroups?.map(({name, components}) => ({name, components}))||[]),
    {name:"Rich weather, media, news and dashboards",components:richComponents.map(component=>component.name)}] });
export const promptOptions = {
  preamble: "## Interactive answers in Overview Labs\nPrioritize embedded generative UI whenever it makes the answer easier to understand, compare or use. In text chat, weather and forecasts, structured data and metrics, comparisons, trends, schedules and plans, image galleries, and calculators or forms should normally use a concise OpenUI visual, even when the user did not explicitly ask for a card, chart or interactive response. Choose the simplest useful presentation and render it directly in the existing chat. Respect explicit text-only or exact-format requests; greetings, simple confirmations, single facts and prose-focused answers can remain Markdown. Use a fenced openui block for OpenUI Lang; the rules below apply INSIDE that fence. Keep supporting explanations outside it. Do not announce component, framework or skill implementation details. This is answer presentation, not a reason to create/deploy an app or run build commands.",
  bindings: true, toolCalls: false,
  additionalRules: [
    "Use the original flexible OpenUI formats as the default: inline images and playable media, compact headline/thumbnail rows, native Tables, charts, EntityList, Steps, forms and clear Stack layouts. Choose the format that suits the data. Cards are optional and only appropriate when grouping genuinely helps; never wrap every result or metric in a card, force a tile dashboard or treat native components as a fallback. VideoPlayer/VideoGallery, MusicPlayer, NewsFeed, StockChart and MetricGrid remain optional conveniences, not mandatory templates.",
    "For every weather or forecast answer, use WeatherCard with real provider weatherCode, isDay, cloudCover and intensity/astronomy fields when available. This is the dedicated dynamic-weather-card renderer, including forecast icons; do not substitute plain text, custom icons, tiles or generic native cards. Respect explicit text-only requests and clearly state unavailable data. Other domains retain flexible native OpenUI formats.",
    "Aim for polished product UI: clear visual hierarchy, compact metadata, strong imagery, useful charts, consistent spacing and concise controls. Pass real provider media URLs and thumbnails from tools; never fabricate a playable file, video ID, image, financial series or source. Put video search results into players rather than link lists; unsupported or publisher-restricted media keeps an original-source link. Native players load on demand. The weather component owns tasteful motion, pausing offscreen/when hidden and respecting reduced motion; do not add separate animation loops, polling or autoplay.",
    "For search results, map returned title/url to the component's title/src (video) or title/url (article); imageUrl/thumbnailUrl becomes poster (video/music) or image (news), duration stays duration, and publishedAt stays publishedAt. Preserve actual publisher/author and sourceUrl. Use supplied metadata and resolve a needed missing media source only through authorized tools; a real missing-image fallback is preferable to a guessed URL. Label sample data explicitly. Financial history uses StockChart series [{time,value}] from real tool results, not a made-up decorative sparkline.",
    "Default to compact, borderless compositions embedded directly in the answer. News usually fits headline rows with modest thumbnails and source/date metadata; videos fit inline players with short captions; weather always uses WeatherCard backed by dynamic-weather-card, with optional supplementary charts; measurements fit labels or a Table; trends fit charts; plans fit lists/steps. Keep the user's requested content primary. Do not add artificial controls, oversized tiles, decorative panels or unrelated examples. Use Card only when asked or when it improves a specific grouping. If a visual adds no value or the user asks for text only, answer in Markdown.",
    "Present the answer's actual available data in the visual with clear labels, units, relevant dates/timezones and source links. Add brief prose only where it helps; do not repeat the complete dataset in Markdown. Never invent values, fetch extra data solely to decorate a visual, or launch another generation/build/install step. Stream a small native composition as part of the same answer. When data is missing, show the limitation clearly rather than a fabricated chart or weather card.",
    "Embed OpenUI Lang inside a fenced openui block in the existing Markdown answer. Markdown explanations belong outside the fence. Do not use the old open-generative-ui JSON/HTML/JavaScript format.",
    "Write root = Stack([references]) FIRST, then define each reference immediately as a short line. The host reveals the finished block once its fence closes; finish every referenced component before closing the fence. Prefer concise native component calls and reactive $variables to writing custom code. Keep the block below 100000 characters and 300 statements.",
    "Build complete, professionally composed interfaces with consistent hierarchy, concise labels, aligned controls, meaningful visuals and compact spacing. Use gap s or m, aligned start, and wrapped rows on small screens. Do not add spacer components, oversized empty areas or a card around everything. The host supplies the site's black/white theme; never inject CSS, HTML, scripts, external libraries or fixed colors. Use semantic native components from this library only.",
    "Every visual must work in a narrow mobile chat pane as well as on desktop. Use fluid Stack/Card layouts, wrapped rows, responsive card blocks, short accessible control labels and concise table columns. Avoid desktop-only multi-column assumptions, oversized padding, fixed dimensions, long unbroken labels and side-by-side chart legends. Put dense comparisons in a Table with clear headers so its own scroll retains all columns. The host reflows rows within each layout's available width, wraps text, fits images/charts and bounds dialogs; never rely on the device viewport being as wide as the chat. Preserve useful content and controls on phones, tablets, landscape screens and split panes.",
    "There is no browser tool provider. Do not emit Query, Mutation or @Run. Data is a snapshot supplied by the authorized agent tools. Local state and calculations do not change server data. Label assumptions, examples and units; never claim a trade, deployment, save or other server operation occurred from a visual alone.",
    "@ToAssistant proposes a follow-up draft with the selected values. The user sends it through the existing chat composer. It does not auto-send or replace an existing draft. @OpenUrl must use an HTTPS URL without embedded credentials. Never place secrets or data from another organization in a visual.",
    "For tailored interfaces, compose the components, $state, expressions, @Set and @Reset into calculators, planners, quizzes, decision trees or dashboards. Do not generate arbitrary JavaScript/React or run installs/builds to answer a chat question. Avoid polling, model-authored continuous animations and auto-dismiss callouts; the trusted weather component supplies its own managed motion. Show real controls, useful error/empty states, source/assumptions and accessible labels.",
  ],
  examples: [
    'root = Stack([estimate, units, total, reset])\n$qty = "10"\nestimate = TextContent("Example price: $2 per unit")\nunits = FormControl("Units", Input("qty", "Units", "number", {min:0}, $qty))\ntotal = TextContent("Example total: $" + ($qty * 2))\nreset = Button("Reset", Action([@Reset($qty)]), "secondary")',
  ],
};
