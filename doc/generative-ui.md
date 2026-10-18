# Interactive answers in chat

Overview Labs uses [OpenUI](https://github.com/thesysdev/openui), with
`@openuidev/react-lang` 0.4.1 and `@openuidev/react-ui` 0.17.1. The CLI
self-hosted reference was scaffolded with `@openuidev/cli` 0.5.2. OpenUI's native
renderer and complete general-purpose component library are embedded in the
existing chat surface. The app keeps its agent connections, tools, conversation
storage and socket transport; it does not use the starter's in-memory history,
a separate app server, or a new Gateway account.

## Streaming format

Agents put OpenUI Lang in an `openui` Markdown fence. This works in Admin,
organization/agent chats, task threads, onboarding and assistant transcript
views. Supporting prose remains Markdown; human code examples never execute.

Embedded generative UI is the default presentation preference whenever a visual
helps. Weather and forecasts use suitable compact visuals without requiring cards;
structured metrics, comparisons, trends, plans, galleries and useful
forms/calculators use appropriate native components. Supporting prose stays
brief and does not duplicate the complete dataset. Explicit text-only and exact
format requests take precedence; greetings, simple confirmations, single facts
and prose-focused answers can remain Markdown. Agents use the real data already
needed for the answer, including units, dates/timezones and source links, without
an additional generation pass, decorative data requests or background work.
This is a shared model presentation instruction, not a forced conversion of
every text reply into a component.

The original flexible native OpenUI formats are the default. Use borderless
inline compositions, tables, charts, lists, forms and players according to the
content; Card is optional when explicitly requested or useful for grouping.
NewsFeed uses compact thumbnail/headline rows, and media has inline players
with concise captions rather than large card bodies. Optional domain components:
`WeatherCard(weather)` supplies a large temperature, condition illustration,
metrics and optional forecast; `VideoPlayer(video)` and `VideoGallery(videos)`
embed playable results; `MusicPlayer(track)` supplies audio controls or a provider
player; `NewsFeed(articles)` presents real thumbnails and headlines;
`StockChart(stock)` provides quote/history inspection and local range controls;
and `MetricGrid(metrics)` provides inline values with optional real sparklines.
The signatures and nested object fields are generated from the same Zod schemas
as the renderer. Agents combine these with the full native library and local
state for custom interfaces.

Weather illustrations are trusted SVGs selected from WMO condition codes or a
supplied condition. Sun, cloud, rain and snow motion uses CSS transforms/opacity,
pauses outside the visible pane or hidden document, supports an explicit pause
control and honors reduced motion. No animation worker or frame loop runs on
the server. Unavailable optional measurements are omitted instead of invented.

Direct video/audio files use browser controls with `preload="none"`. YouTube,
Vimeo and Spotify frames are constructed from validated content identifiers,
never model-authored iframe HTML or arbitrary embedding origins, and load only
after an explicit Play click. The original-source link remains available when a
provider or publisher prevents embedded playback. Loading has a bounded timeout
with an inline retry/source fallback. Explicit playback keeps its chat answer
mounted while scrolling. Paused players keep their stable DOM and preload none,
while offscreen animations and streamed updates remain dormant.
Navigation away stops playback. Existing organization permissions protect local
media download URLs.

News images use the shared safe image loader and deliberate missing-image
fallbacks. Financial charts use only supplied history, sampled to at most 501
plotted points, with keyboard/pointer inspection that preserves the quoted
snapshot. Range controls filter the supplied data without fetching prices or
implying a live feed. Sources, units and observation/publication times stay
visible. Visual values come from `ui/src/index.css`; styles are in
`ui/src/styles/rich-generative-ui.css`, and stories are in
`ui/storybook/stories/rich-generative-ui.stories.tsx`.

```openui
root = Stack([field, total, reset])
$qty = "10"
field = FormControl("Units", Input("qty", "Units", "number", {min:0}, $qty))
total = TextContent("Example total: $" + ($qty * 2))
reset = Button("Reset", Action([@Reset($qty)]), "secondary")
```

Write `root` first and then define each referenced component on its own line.
The renderer receives accumulating text and displays complete definitions before
the fence closes. It coalesces updates in short batches and holds an unfinished
statement out of the renderer, including Markdown's synthetic trailing newline.
Partial labels, arrays and image URLs therefore cannot repeatedly reshape an
already visible component. New root components reveal once, with stable identity,
and natural content height drives a short transition on the surrounding frame.
Image previews reserve space and contain the whole image. Native controls
become available when the block completes.
No HTML/JavaScript generation, iframe startup, compilation, installation, or
build is needed for each response. Model startup, reasoning, token generation
and real data lookups still contribute to latency; this does not guarantee an
instant model response.

## Components and interaction

The library includes native layouts, cards, text, tables and editable tables;
bar/line/area/pie/radar/scatter charts; forms, inputs, ranges, selects, dates,
checkboxes, radio buttons and switches; tabs, accordion, carousel, modals, steps,
images and galleries, metric/card blocks and supporting components. Agents
compose these with reactive `$variables`, expressions, `@Set` and `@Reset` for
custom calculators, planners, quizzes, decision trees and dashboards. Component
signatures and the parser schema come from the same library snapshot.

`@ToAssistant` prepares a draft in the current chat. It never automatically
sends, replaces an existing draft, or saves data. `@OpenUrl` opens an explicit
HTTPS link with `noopener,noreferrer`; credentials in URLs are rejected. Backend
changes remain subject to the normal authorized agent tools and organization
boundaries. No browser tool provider is registered. `Query`, `Mutation`, `@Run`
and script bundles are rejected at the transport boundary. Model code is not
executed in the host: only registered React components and OpenUI expressions
are evaluated. Source is limited to 100,000 characters and 300 lines.

The lazy renderer sleeps when offscreen or when the document is hidden, except
while a user-initiated player is active. Its
local input state is retained for remounting in the current page session. There
is a one-time preload when the user focuses a chat composer, so generation does
not have to wait for a cold component download when they start a request. There
are no added server workers, polling tasks or JavaScript animation loops.
Admin, task/agent, conference room and onboarding chats follow growing content with an
interruptible glide rather than repeated jumps. This includes late image and
component layout changes. Scrolling up cancels following; the latest button
resumes it. Animation frames stop at rest and when hidden. Reduced-motion
preferences disable reveals, height transitions and animated following.
Current
site theme tokens supply component colors and typography; changing the theme
does not remount an answer. Images share the site's loading/fallback/retry
presentation. The original chat's attachments and image restoration continue
to use the existing storage APIs.

## Responsive layout

All chat surfaces use the same responsive renderer, including saved OpenUI
answers. Stack and Card layouts measure their own available width with CSS
container queries. Rows wrap on wide panes and become full-width columns below
40rem, even inside a narrow card on a desktop. Galleries and card blocks also
reflow inside the answer. Forms and charts shrink with their container; long
labels wrap. Tables and code retain all data with scrolling confined to their
own region. No content is removed to make the page fit.

Inputs use the site's base font size to avoid focus zoom on iOS. Touch devices
get larger control targets. Date and range pickers keep OpenUI field bindings
and validation, using the native calendar inside an accessible, fitted dialog.
Image previews and reactive modals use the shared
accessible dialog, bounded to the dynamic viewport and safe areas with internal
scrolling. Modal state remains bound to its OpenUI variable, and resizing or
changing themes does not recreate controls. These are CSS layout rules, with no
resize polling, background worker or extra rendering loop. The shared agent
presentation instructions require mobile-friendly composition too.

## Presentation contract

`ui/src/components/generative-ui/library.tsx` defines the library and prompt
options. Regenerate the prompt and spec after changing it:

```sh
node scripts/generate-openui-prompt.mjs
```

This uses the pinned official CLI, refreshes the generated library spec and
prompt, and synchronizes the shared agent and board instructions. Set
`CPTR_SOURCE_ROOT` to the Admin Python package directory to synchronize its
`utils/generative_ui.py` contract too. Rebuild shared/UI packages and restart the
supervisor after publishing updated Python/shared instructions. Existing active
turns use the instructions with which they started.

## Saved visuals from the previous framework

OpenIntelligentUI, Websandbox, the old generated-code runtime and toolkit have
been removed from the active UI. Historical `open-generative-ui` and
`open-intelligent-ui` blocks retain their saved source, with a **Recreate
interactive answer** button that prepares a follow-up for OpenUI regeneration.
They do not execute the retired renderer. Existing conversation text and
attachments remain available. New invalid visuals show an inline error and the
same recovery action rather than taking down the conversation.
