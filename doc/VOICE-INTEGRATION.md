# Voice integration

## Local News category and evidence delivery repair — 2026-09-28 01:44 UTC

Real recorded-audio tests reproduced the reported Hamilton crime question with
the production constrained Gemini 3.8 Live Extended Thinking/HIGH setup and the
normal per-turn authenticated roster. The original turn made no observable
function call, then claimed a generic system error. Independent SearXNG reads
completed in hundreds of milliseconds. A separate successful tool turn returned
some same-name township or neighboring-city stories, so search completion alone
was not a correct local-news answer. No quota, browser permission, or transport
failure was established for this incident.

Passive evidence injection with `turnComplete: false` did not resolve the false
error. An actual completed News read delivered with `turnComplete: true` before
provider output did produce an answer with the same model and voice. The deployed
application path now applies this narrowly to complete, recognized local-news
requests. Its canonical place planner uses the public 2026 US Census gazetteer,
preserves legal place types, rejects ambiguous names, and only reuses a place for
a strict follow-up within the same session. It sends a reconstructed public
place/topic query, never arbitrary speech or organization context, to SearXNG.

All voice search paths now require exactly one category; the legacy organization
tool no longer silently substitutes General. News date filtering rejects invalid,
ambiguous, future, or out-of-window publication timestamps before limiting rows.
Explicitly wrong-category upstream rows are excluded. Results identify geography
as unverified and distinguish publication time from incident time.

The new authenticated `news-context` read rechecks the speaker, company, chat
generation, selected agent, budget, credential, instruction revision, and tool
permissions before/after the search. Its server timeout is 1.25 seconds; the
client can deliver only within 1.5 seconds, before provider output/tool attempts.
New speech, continued transcription, provider activity, End, or authorization
changes discard stale results. Evidence turns cannot perform mutations. Results
feed ordinary source attribution, with no search popup. A normal operation-policy
denial does not terminate voice; typed session/credential/revision revocation does.
Provider completion-reason diagnostics store only allowlisted enums and booleans.

Verification before deployment:

- 296 focused route, instruction, hook, search and research tests passed.
- 262 focused UI helper/transport/hook tests passed; this count overlaps the hook
  tests above and must not be added to it as an independent total.
- 91 canonical-place/request-planner tests passed.
- Server, UI and shared TypeScript checks, UI production build, design-token gates,
  and the offline live-canary self-test passed.
- All four recovery/browser scenarios passed in both Chromium and WebKit. The
  new case navigates Projects/Tasks during News lookup, retains one microphone and
  socket, carries the canonical follow-up location, verifies source attribution,
  rejects an automatic write, and opens no search popup. One pre-existing
  cancellation case initially raced the test runner; speech now starts in the
  same browser evaluation as the preceding audio packet, and both projects passed.

Six runtime modules were backed up and deployed at 01:44 UTC, followed by one
application restart. SearXNG configuration was unchanged. Both services are
active and the application health endpoint is ready. Backend backup:
`/tmp/voice-news-context-backup-20260928T014436Z`. UI entry:
`/assets/app-v2/index-BJjy5BFk.js`, SHA256
`90e751c1824ea0116e5f889943417511e3e5a73e32c913ea1555652ff6c29565`.
Public asset bytes match the tested build. Prior assets were retained, with
entrypoint backup `/tmp/voice-read-recovery-backup-20260928T014457Z`.

The first production helper/audio probe incorrectly treated an old IDLE after
evidence-triggered interruption as answer completion. Its 2 audio bytes and 17
transcript characters are not a pass. The harness was stopped and its substantive
answer/drain guard corrected before evaluating final provider behavior. Browser
tests and provider probes do not certify a physical Safari microphone or promise
error-free future provider behavior.

The corrected production probe completed both actual-audio turns with the real
client helper and authenticated endpoint. The explicit Hamilton crime request
performed a 97 ms News/week lookup, delivered evidence 675 ms after speech end,
and returned a supported southwest-Ohio crime-news summary. The primary Ohio AG
release has a Hamilton dateline and describes Butler County guilty pleas; this is
regional reporting, not proof of a new Hamilton-city incident. The implicit
follow-up correctly retained Hamilton/Ohio, performed a 53 ms News/week lookup,
and delivered its three dated results at +692 ms before output. Extended/HIGH
nevertheless claimed a generic system error without an observed valid function
call or API/transport failure. This is a failed follow-up validation, not a full
voice-error fix. Evidence:
`/tmp/voice-news-production-helper-audio-high-repeat.log`.

The final repair explicitly resolves a subsequent matched request in the evidence
prompt: current canonical place, crime/news topic and validated publication
window. It preserves the original spoken request, uses a new explicit place over
the previous one, and describes search completion without claiming verified local
incidents. The prefix is derived only from the exact server-reconstructed query.
System instructions, model, thinking level and transport were unchanged. A
candidate two-turn audio test then passed, followed by an independent repeat
using the actual final helper without a prompt wrapper:

- Explicit Hamilton crime question: News/week lookup 400 ms; evidence delivered
  867 ms after speech end; first audio at 7.696 seconds from audio start; full
  playback drained at 20.259 seconds.
- Implicit crime follow-up: retained validated Hamilton/Ohio; News/week lookup
  45 ms; evidence delivered 549 ms after speech end; first audio at 6.808 seconds
  from audio start; full playback drained at 17.914 seconds.
- Both produced spoken summaries supported by the returned regional news, with
  no system-error claim, wire error, tool envelope, malformed call or cancellation.
  These were regional guilty-plea updates, not verified new Hamilton-city crimes.
- The probe used the actual helper and reproduced the relevant four-condition
  mutation-fence release. It is not a substitute for the browser or physical
  microphone tests. Evidence: `/tmp/voice-news-final-helper-audio-high.log`.

Final helper/transport tests: 54/54 passed. UI typecheck/build and final News
navigation cases passed in Chromium and WebKit. Independent prefix review found
no blocker. Final helper SHA256:
`89379a6b3fca9d77ca3e68fa950f190b86f2f7380e71a1b5e9ab6b6640125fd9`.
The final UI was published at 01:56 UTC without another server restart:
`/assets/app-v2/index-BvZ3SvsU.js`, SHA256
`e82c85373beb627936e95e6cdac1b8db402f3352f7c0a0fe6afb7bae71675360`.
Public asset bytes match the build; health and runtime hashes remain correct.
Entrypoint backup: `/tmp/voice-read-recovery-backup-20260928T015626Z`.
Release manifest: `/tmp/voice-news-final-release-20260928.json`.
Existing tabs need End voice and reload to receive the new helper. Two successful
live two-turn runs support this repair; they do not guarantee every future model
response. The supported deterministic planner remains intentionally narrow;
other requests use ordinary authorized search tools.

## Startup availability and bounded read verification — 2026-09-28

A newly reproduced application blocker was independent of Google quota. The CEO
was marked `error` after an `acpx_turn_failed` text-adapter terminal-limit failure;
its configured monthly budget and spend were both zero. The voice creation route
rejected that recoverable execution state before contacting Google. Voice now
admits `error` agents through the same personal-credential authorization while
retaining administrative suspension and budget gates. Those gates are checked
before minting, after minting, and on every existing-session operation. No agent
status was cleared and no budget or role was changed. The route-only repair was
deployed at 00:39 UTC; its backup is
`/tmp/voice-availability-backup-20260928T003924Z`.

Read verification now covers a separate zero-tool-attempt case. It observes every
incoming function attempt before missing-ID/duplicate/cancellation filtering and
never confuses a cleared ledger with proof that no operation ran. Original errors
remain audible and visible. One correction may execute at most three explicitly
allowlisted reads within 20 seconds, including fresh authorization; it cannot
execute writes, commands, connector calls or another model. The deadline is
checked at reservation, execution, post-authorization and result delivery. Hanging
reads settle once with a precise timeout result, and later HTTP results are
ignored. Cancellation and fresh speech retain the existing mutation fence.

The fresh authenticated roster returned for recovery is supplied in the same
corrective turn rather than discarded. This is a newly authorized directory read,
not replay of old private evidence. It preserves permitted-agent visibility and
identity metadata. Directories larger than 32 KB are omitted rather than truncated
into a misleading partial count. Directory facts do not stand in for web results.

Real-provider testing exposed a missed direct failure phrase: the previous matcher
did not recognize “I apologize, but …”. The updated matcher handles that natural
apology while retaining quotation, correction and negation exclusions.

Evidence remains mixed and must not be reported as universal recovery success:

- Four initial constrained Extended Thinking/HIGH text-input originals produced
  three zero-tool generic-error replies. The fourth had no generic error but no
  fresh tool evidence, so it was not counted as a semantic pass.
- With the corrected matcher, a Hamilton News original reproduced the error with
  no calls or wire errors. Exactly one actual-helper correction ran. It omitted
  the generic-error phrase but still made no search and failed semantic validation.
- A separate live roster original made an authorized 61 ms read and correctly
  answered 13 permitted AI agents. It needed no recovery.

These probes used real Google audio output and the production constrained setup,
but text input rather than a physical browser microphone. The first two batches
did not reproduce the normal UI's per-speech roster injection; that distinction
limits comparison to microphone turns. No probe persisted conversation content
or executed writes. Metadata logs are `/tmp/voice-zero-tool-helper-high.log` and
`/tmp/voice-zero-tool-helper-updated-high.log`.

Current verification: 390 focused UI/protocol tests and 88 route/instruction tests
passed. Server and UI TypeScript checks passed. The standard server typecheck
wrapper hit an unrelated runner prebuild missing `ajv`; direct server `tsc` passed.
The full browser suite passed 23 tests with one existing Linux WebKit offline
skip, but source changed during that run; final recovery cases are checked again
against the final source. Full capability parity, physical Safari microphone
behavior and error-free provider generation are not certified.

Final verification and deployment for the repair above:

- Final Chromium/WebKit recovery cases: 6/6 passed against unchanged helper
  `b74ea1e6e531131bb911af47a46aa89957c416b75bf6316a6e486796fdddfa27`
  and transport `5e6fc5831bca9148361df60947ca71dd07814674f55a5737b03492d2ebf79db1`.
  Evidence: `/tmp/voice-browser-recovery-final-hashes.log`.
- An actual recorded-audio agent-count question, normal per-speech fresh roster,
  production constrained Extended Thinking/HIGH and real Google audio output
  returned the correct current count. It transcribed the question correctly,
  finished at 10.436 seconds from audio start (including 4.68 seconds of input),
  and first output audio arrived at 5.852 seconds. No correction or function call
  was needed because the newly authorized roster supplied the answer. Evidence:
  `/tmp/voice-fresh-roster-helper-high.log`. This is not physical Safari testing.
- No existing Hamilton News audio fixture was available. News recovery still
  failed semantic validation in the text-input test; it is not certified fixed.
- UI build, token gates, final UI typecheck and 390 focused tests passed.
  The final UI was published at 00:50 UTC without another server restart:
  `/assets/app-v2/index-BMCoxjEr.js`, SHA256
  `974977acd30294fcbc74b7cd6b92f784520f37fdde51edc153383f68b8f16b88`.
  Public bytes match the tested build; index, asset and health returned HTTP 200.
  Prior hashed assets remain intact; entrypoint backup:
  `/tmp/voice-read-recovery-backup-20260928T005007Z`.
  End voice and reload existing tabs to use the updated client.

## Public research recovery — 2026-09-28

The reproducible remaining behavior is a generated error claim, not necessarily
a failed search: one unchanged production Extended Thinking/HIGH session made
three successful News searches (306–485 ms each), then claimed a system error.
A single same-session correction using those delivered results answered correctly
without another tool call (first audio 954 ms; full spoken interaction 22.46 s).
This establishes one successful recovery, not universal provider reliability.

The client now implements a bounded version of that correction:

- Only successful, delivered public search/page-read evidence from the current
  local speech turn qualifies. It retains at most 48 KB in memory. Actual errors,
  cancellations, malformed/oversized results, private reads, writes, commands,
  connector calls and failures before any tool request do not qualify.
- One correction runs on the same selected model/session after provider IDLE and
  actual playback drain, with a fresh session/access check. The original speech
  remains visible and audible. No alternate model or phrase masking is used.
- Identical public reads reuse verified receipts after reauthorization. Recovery
  calls are restricted to an explicit read allowlist in code; mutation authority
  stays fenced until a new completed/transcribed user utterance and a provider
  idle/interruption boundary. New speech, End or newer provider activity cancels
  a pending correction. Private read receipts are never replayed by this cache.
- Fixed an actual Chromium audio-clock race caught by the new browser test:
  wall-clock idle timers can fire before the audio render clock reaches the drain
  deadline. The timer now rechecks/re-arms instead of losing pending progress or
  correction. Pending tools retain Thinking; cancelled completion restores idle.
- Research AbortSignals now reach the browser fetch. This does not cancel
  server work already received and does not abort/retry dispatched mutations.

349 focused tests, UI typecheck, token gates and the production UI build passed.
The browser suite passed 21 tests with the existing Linux WebKit offline-emulation
skip. Four recovery cases then passed again against unchanged final source
hashes (Chromium and WebKit). These use synthetic microphone/provider/API fixtures; they are not Google
inference or physical Safari hardware validation. The newly added cases cover
recovery across navigation, audio drain, original/corrected transcripts, duplicate
read caching, blocked writes and cancellation.

Additional real-provider checks on unchanged production constrained tokens passed
roster, NASA and Hamilton News. A final check using the compiled recovery helper
also passed Hamilton News (two searches, 822/364 ms) and NASA (one search, 904 ms).
Those final originals did not fail, so the helper correctly did not retry them.
Complete spoken interactions took 45.62 s and 26.88 s; these are not instant
responses. Probes used text input with real audio output, saved no transcripts
and executed no writes. Failures before tool execution and repeated provider
misreporting remain release limitations; full end-to-end readiness is not certified.

Evidence: `/tmp/voice-readonly-recovery-high.log`,
`/tmp/voice-readonly-recovery-high-additional.log`,
`/tmp/voice-compiled-recovery-high.log`,
`/tmp/voice-recovery-targeted-final.log`,
`/tmp/voice-read-recovery-browser-final.log`.

Published at 00:04 UTC without a server restart:
`/assets/app-v2/index-B3teWXcI.js`, SHA256
`6374143d867aa2a7d9b5b2d588ec40d91cebd09a47d3f59678df8223b2b525ee`.
The public bundle matches the tested build; application and SearXNG health return
200. Previous hashed assets remain available. Rollback entrypoints are in
`/tmp/voice-read-recovery-backup-20260928T000423Z`. Existing open tabs must reload
after ending voice to use the new client.

## Follow-up repair — 2026-09-27 23:09 UTC

Three additional fixes are deployed. Extended Thinking/HIGH and the user's
personal Gemini credentials remain unchanged. The intermittent spoken
system-error claim is **still not resolved end to end**.

- Fixed a reproduced promise-ordering race: `activeTools` previously reached
  zero before the FunctionResponse was sent. A concurrent progress poll could
  use an older IDLE signal and inject background text before the result reached
  Gemini. The pending count now covers response delivery/discard and cleanup.
  Both successful and failed tools have regressions that failed before the fix.
- Safari's optional local WebRTC playback connection now has a 750 ms fallback
  deadline instead of 3 seconds. Healthy WebRTC and browser autoplay checks
  remain intact; other browsers retain the existing deadline. Production had
  taken 2.54–2.59 seconds to reach listening while provider setup/capture were
  ready much earlier. This reduces the failed-local-peer wait, not microphone
  permission time or provider reasoning time. Physical Safari hardware still
  requires verification by the user.
- Replaced the HTML Google News parser with a News-only public RSS engine that
  exposes real publication timestamps. The app passes native time_range and
  still enforces the exact rolling UTC cutoff. No General fallback, inferred
  dates, article fetching, or CAPTCHA bypass was introduced. The exact public
  Hamilton crime/week query returned eight dated News results in 324 ms on the
  deployed SearXNG service. Through the authenticated voice tool route it
  returned three matching dated results in 499 ms. General, Images and Videos
  returned their own categories in 612–846 ms with no upstream warnings.

Validation: 129 UI/protocol/progress/playback tests, 77 search tests, 11 RSS parser
and security tests, and 17 browser tests passed. The existing Linux WebKit
offline-emulation case remains explicitly skipped. Direct server/UI typechecks,
token gates and the production UI build passed. Browser tests use fixture
provider/API responses and a synthetic microphone, not real Google inference.

The post-deployment real-provider check connected in 603 ms. The roster tool
completed in 49 ms and the exact Python arithmetic command in 64 ms; both
produced correct spoken answers. The News turn still generated a system-error
claim **before any tool call**, with no transport failure. The readiness command
correctly exited nonzero. The client race cannot explain failures in this
standalone probe, which has no background progress polling.

Additional bounded diagnostics retained the same model: HIGH, MEDIUM and LOW
all reproduced a false claim against a synthetic tool. Production reasoning was
not changed. A subsequent canonical name/id/result fixture passed, reinforcing
that the problem is intermittent. Four recorded-audio history-initialization
comparisons also passed, but their reminted tokens copied the browser setup and
omitted the private production system instructions. Those stripped-prompt
comparisons do not validate production history behavior or establish a history
repair; no speculative history change was shipped. A reusable standalone synthetic
provider check is available as `pnpm test:voice-provider`; it requires explicit
provider testing and a securely supplied GEMINI_API_KEY, prints metadata only,
and never invokes organization tools or another model.

Published UI: `/assets/app-v2/index-nEDbEJQm.js`, SHA256
`be703f68aa1b87947b77b18c033936de86a1423f75017a9abeb487da3024555a`.
Public bytes match the tested build. App and SearXNG services are active, health
is 200, and prior hashed assets remain available. Restricted rollback backup:
`/tmp/voice-followup-backup-20260927T230551Z` (contains service configuration;
do not publish). Operational evidence: `/tmp/voice-followup-live-readiness.log`,
`/tmp/voice-followup-api-search.log`, `/tmp/voice-repair-browser.log`, and
`/tmp/voice-history-audio-ab.log`. No probe transcripts were saved to chats.

## Reliability repair and remaining release blockers — 2026-09-27 19:48 UTC

**The application repairs below are deployed. End-to-end voice reliability and
full execution parity are not certified.** Extended Thinking/HIGH remains the
selected model, using the authenticated person's Gemini key. No alternate model,
Codex fallback, transcript masking or automatic mutation replay was introduced.

### What the incident evidence shows

The reported crime-news request completed its search in 363 ms and the browser
reported submitting the result in 867 ms. Those records did not prove that
Gemini consumed the evidence; they also did not record result counts. New local
diagnostics distinguish empty results, usable results, partial warnings,
command failure/timeouts and approval-pending outcomes without recording query,
command, result, transcript or credential content. Client lifecycle events record
input boundaries, provider interruptions/output/idle/disconnection and time since
tool response, with strict schemas, session authorization and bounded event caps.

Eighteen bounded real-provider turns varied full versus empty history, a minimal
prompt, one versus eight tools, result/output/string response shapes and
constrained versus direct v1beta/v1alpha connections. Thirteen produced the
spoken system-error claim **before any function call**, with no wire error or
local interruption. Two additional fresh-session, official-shape simulated
flight tools reproduced the claim after successful function-response submission,
also with clean transport. These isolate a provider-level behavioral concern;
they do not prove that every call fails or that a prompt can eliminate it.
Additional verified-result context was not a demonstrated repair and was not
shipped. Changing models or lowering reasoning was not authorized.

A later three-scenario live readiness run passed both before and after deployment:
actual roster lookup, public search and a harmless Python arithmetic command all
produced correct spoken answers. The post-deploy provider setup took 796 ms;
individual tools took 74–826 ms. Complete interactions took 12.7–19.6 seconds,
including reasoning and generated audio. No transcripts were saved.

The exact crime-news regression connected in 464 ms and issued a News search in
268 ms, then incorrectly changed a subsequent search to General despite the
explicit News request. It did not say system error on that run, but the category
assertion correctly failed. That interaction took 42.7 seconds. Passing isolated
turns is not a guarantee of consistent results or prompt adherence.

### Repairs deployed

- Workspace output now preserves UTF-8 across stream chunks. Concurrent commands
  and unavailable execution return specific errors; timeout/process-tree cleanup,
  user/agent/company isolation and host/network exclusions remain enforced.
- Direct organization requests preserve HTTP failures when an upstream response
  is HTML/empty. Unreadable successful write responses instruct verification
  before retrying. Document tools specify Markdown and revision requirements.
- A connector's nested MCP error can no longer appear successful to voice merely
  because the transport completed. Voice returns a sanitized failed outcome,
  preserves a valid invocation reference and marks its own audit run failed.
  Partial effects are not excluded; there is no automatic retry. The shared
  connector gateway's separate invocation record is not rewritten by this adapter.
- Voice setup enables provider-tested, fully bound sliding-window context
  compression. Provider time-limit messages now terminate with specific restart
  guidance, without replaying pending actions. Automatic session resumption is
  **not implemented**: the experiment did not establish a safe client-only path
  through the fully constrained token setup, so no field-mask weakening shipped.
- Ending voice suspends the animation's shared analyzer AudioContext; the next
  call resumes it. The existing four-sided animation and floating controls remain.
- Added an opt-in real-provider readiness command (`pnpm test:voice-live`) and an
  isolated browser regression command (`pnpm test:voice-browser`). A live failure
  exits nonzero rather than being hidden by a successful mocked test.

### Verification and limits

- 103 backend tests passed: real authenticated task CRUD/completion, comments,
  revisioned documents, permission/isolation checks, connector approvals/errors,
  isolated Python/Node execution, timeout and concurrency behavior. Test records
  used ephemeral databases; no production task/document changes were made.
- 63 voice route tests and 9 content-free outcome tests passed.
- 186 focused protocol/hook/component tests and 265 remaining UI/shared voice
  tests passed. The indicator's final dedicated suite passed 15 tests.
- Real Chromium/WebKit browser harness: **17 passed, 1 explicitly skipped**.
  Navigation, pane replacement, mobile resize, interruption, actual Web Audio
  suspension recovery, End/retry cleanup, late result suppression and service
  worker update behavior are covered. Gemini/API/microphone sources are fixtures;
  audio processing is real. Linux WebKit offline emulation is the explicit skip.
  Physical Safari microphone/speaker hardware has not been tested here.
- Direct server and UI typechecks, token gates and production UI build passed.
  The repository-wide recursive typecheck stopped on the unrelated
  `whoxos-eval-kernel` package's missing local dependencies/Node type definitions.
  A full repository test/build pass is not claimed.

Voice tools remain a scoped operation catalog and an isolated, bounded coding
workspace. They do not yet provide VPS/root administration, networked package
installation, arbitrary deployment APIs, agent hiring/configuration/resume or
workspace-file download publication. See [current capabilities](AGENT-VOICE.md).
These gaps and the live provider failures prevent the requested full Codex parity
and production-readiness claim.

Published UI: `/assets/app-v2/index-puMKRJXp.js`; SHA256
`7b04a31f4142a676a9ba197f0af996bb51114583522b99ada99d10a2688c1c4c`.
Public bytes match the tested build. Old hashed assets remain available. Four
runtime modules were atomically replaced with backups; all import successfully.
App health is 200; app and SearXNG services are active. Rollback backup:
`/tmp/voice-reliability-backup-20260927T194432Z`.


## Current configuration and connection fix — 2026-09-27

### Background-only search and conversational progress

The global voice overlay no longer mounts any web-search results card, including
legacy Google cards. It shows voice controls and a compact activity label driven
by actual pending tool callbacks. Sources remain tool evidence and can be cited
in the ordinary response; searches never open a floating results panel. Existing
browser tabs need a reload to load the updated JavaScript.

Shared communication policy version 2 applies to new and resumed managed text
turns and voice sessions across all organizations. Agents briefly explain the
next step as tool-based work starts, without delaying the call, and update the
user on meaningful verified progress, known waits, approvals, results and specific
failures. Intent, queued work, active execution and confirmed completion are
explicitly distinguished. Voice updates should fit natural gaps and yield to the
user, with no repetitive polling narration or invented estimates. Search guidance
now permits those useful acknowledgments instead of demanding total silence.
The policy still cannot guarantee deterministic wording or eliminate upstream
model/service errors; factual failures remain visible.

Runtime progress now compares stable task/conversation/run state as well as new
replies and pending questions/confirmations. The first observation establishes a
historical baseline; subsequent updates carry only new or changed reply/question
content, and canonical signatures ignore timestamps and list ordering. Queued
updates coalesce the newest state while retaining undelivered replies, and remove
questions that are no longer pending. Instruction refresh retains the snapshot.
A disappearing run/question is not proof of success or approval.

Voice progress is sent only when the provider is idle, no direct tool remains
pending, local speech/turn-context work has finished, and audio playback is done.
A successful tool response invalidates an earlier idle signal; cancelled tools
can release queued updates without requiring a new provider event. There are no
extra speech timers or periodic identical announcements. Tool activity labels use
a static allowlist and clear on completion, interruption or session end, without
showing model-supplied queries, tool arguments or credentials.

Background-progress rollout validation: 256 focused UI cases, 84 server
voice/research cases and 10 targeted runtime prompt-injection cases passed.
Shared/UI typechecks, all token gates and the production UI build passed. The
published entry is `/assets/app-v2/index-Yk0c8JFK.js`, SHA256
`7b34635e24224f8ab805d4fe8302587fb78112694b02bb548cd128be220dd95d`.
Public bytes match the built asset and no longer contain the search-popup title;
old hashed assets remain available. All four patched runtime modules import, and
installed runtime prompt assembly includes communication policy v2. Production
session creation took 464 ms, retained Extended Thinking/HIGH and eight tools,
returned the new search descriptor and kept private instructions server-bound.
App health returned 200; app and SearXNG services are active. No transcript was
saved by this verification. This checks routing, state delivery, policy binding
and UI behavior, not a guarantee of every generated spoken response. Previously
observed false Gemini system-error replies are not certified fixed by this change.

### Categorized background research

Voice clients now request tools version 3. They receive direct `search_web` and
`read_web_page` functions, avoiding operation discovery and JSON-string
construction during research. `search_web` requires exactly one typed category:
`general`, `images`, `videos` or `news`. The agent chooses from the user's intent:
ordinary facts/weather use General, requests for photos use Images, requested
clips/tutorial videos use Videos, and headlines/current events use News.
Mixed requests use separate calls only when necessary. The authorized server
route remains the same; client versions 1/2 keep their previous function catalog
and can use the generic operation. A missing category from a legacy request
normalizes to General; arrays, comma-separated values and other categories fail.
SearXNG bang/timeout query shortcuts are rejected to prevent category overrides.

Both functions remain NON_BLOCKING. Public reads no longer wait for transcript
persistence, but retain session/revision/cancellation and permission checks.
Prompt guidance requests immediate background searching, normally one focused query
with three results, a concise evidence-based answer, and page reading only when
the requested detail is not established by results. It discourages repeated
progress narration and near-identical searches. Extended Thinking/HIGH is
unchanged, so model reasoning latency still varies.

SearXNG exposes only those four categories and each enabled engine belongs to
one of them. Upstream request limits are 2.5 seconds; the application search
deadline is 6 seconds. Search results carry their category and safe optional
image/thumbnail, duration and publication-date metadata. Snippets are bounded
at 400 characters, with three default/eight maximum results. Identical in-flight
searches share work only within the authenticated scope, with independent caller
cancellation; cached results remain scoped and expire after 30 seconds.

The earlier News engines did not support SearXNG's native `time_range` parameter
(which makes SearXNG skip those engines). For News only, WHOXOS retrieves
candidates and enforces the requested date window using actual publication dates
before applying the result count. Rolling day/week/month/year windows mean
1/7/30/365 days. Undated, older and future articles are excluded rather than
loosening the request; an empty matching set is reported honestly. The 23:09 UTC
repair above adds a date-aware RSS engine and restores native date discovery
alongside this exact server filter. Other categories retain native filtering.

The earlier collapsed **Sources** panel is superseded by the popup removal
described above. New speech still clears old source metadata before transcription;
cancelled/older-turn results cannot republish it. Media is never fetched automatically.

Category rollout validation: 77 search service tests, 21 pinned transport tests,
and 84 research/voice route/instruction cases passed. Direct production API
checks returned relevant General, Images, Videos and News results in 369–856 ms;
scope-local repeat requests took 10–13 ms including HTTP overhead. Combined,
array and unsupported categories returned 400. Independent service probes ran
three queries per category in 0.31–0.97 seconds with no engine warnings. These
are search timings, not end-to-end spoken-answer latency.

A real Gemini Extended Thinking/HIGH session selected the correct category in
all four scenarios and used the typed search tool. Images, Videos and News
produced grounded spoken answers. General incorrectly said “a system error
occurred” despite a successful 628 ms search. The model also sometimes narrated
progress or repeated a query despite the new guidance; the application does not
claim deterministic model compliance. The full interactions lasted 16–36 seconds,
including reasoning and spoken audio. No model was substituted and no test
transcripts were saved. Native Google Search is not used.

After correcting unsupported native News time filters, live week searches
returned three matching dated stories in 295 ms. A day search returned no
matching dated articles in 333 ms and kept the date constraint with a clear
warning. Upstream partial-engine warnings can still occur without invalidating
returned evidence.

Final authenticated production week-search verification returned three matching
stories in 561 ms (43 ms cached), with their publication dates and explicit
server-filter bounds. However, a subsequent real Extended Thinking voice question
said “a system error occurred” without issuing any tool call. This confirms the
remaining spoken failure can occur before the search service is invoked; do not
report end-to-end Gemini reliability as fixed. The model and HIGH thinking were
preserved as requested, and no test transcript was persisted.

The final UI also aborts pending public-research callbacks on new local speech
and suppresses their late results even if an HTTP operation ignores cancellation.
Organization write behavior stays unchanged. After that change, 183 focused
transport/hook/dispatch cases, UI typecheck and the production build passed; the
earlier 207-case UI suite and all token gates also passed. The published entry is
`/assets/app-v2/index-JtasOcWq.js`, SHA256
`8bb1cdb8f3c9e739187552946bf9c656db41e164f1ed3072ee962063e32a4ef5`.
Its public bytes match the built artifact; old assets remain available. App health
returned 200 and the SearXNG service remained active and enabled after deployment.

Do not add function-response scheduling overrides to accelerate this model:
[the model-specific documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live-extended-thinking)
explicitly does not support them. An isolated INTERRUPT probe ended without a
completed answer and was not deployed. Search is asynchronous, but provider
reasoning and spoken-answer quality remain outside the service's latency bound.

### SearXNG replaces native Google Search

Public web research now uses the private core SearXNG service at
`http://127.0.0.1:8888`. New voice setups omit Google's native `googleSearch`
tool, removing that tool's quota gate from voice startup. The legacy
`searchGrounding` request field remains accepted but no longer disables public
research. Gemini 3.8 Live Extended Thinking/HIGH, the user's own Gemini key, and
all organization permissions/approval rules stay in effect. Search and page
reading do not invoke Codex or a second model.

The existing `organization_api` function exposes `search_web` with JSON data
`{"query":"public search terms","category":"general","count":3}` and `read_web_page` with
`{"url":"https://example.com/page"}`. Search returns titles, snippets and source
links. Page reading returns bounded extracted text. Voice shows clickable
SearXNG/public-web sources; external text is evidence, never instructions or
authority to perform other actions. Private organization data and credentials
must not be sent in public queries or URLs.

The same service is available to authenticated API callers through
`POST /api/companies/:companyId/web/search` and `/web/read`. It requires current
company access plus human tool permission or a standard agent's company read
scope; voice intersects the speaker and selected agent. The directory's
`dataAccess.publicWebResearch` documents both routes for text runtimes.
Searches have bounded input/results, short scope-isolated caching and rate
limits. Page fetches reject private networks, pin DNS destinations and recheck
redirects; they send no user cookies or authorization. Request payloads are
excluded from service logs.

Installation and recovery are documented in `scripts/searxng/`. The nonroot
`overview-labs-searxng.service` binds only to loopback, restarts on failure and
starts at boot. It needs no Gemini or Google Search key. Upstream search engines
can still block or throttle requests, and some websites cannot be extracted;
those failures must be reported rather than invented as successful evidence.


SearXNG rollout validation: 395 focused cases passed across service/network
safety, route/auth/log privacy, voice setup and UI source rendering. UI typecheck,
production build and all four token gates passed. The full server typecheck
wrapper remains blocked by the existing runner-vendor `ajv` dependency;
direct `tsc --noEmit` reports the same seven pre-existing issues in task/native
runtime modules, with none in the new research code.

Production health returned 200 after deployment. The published entry is
`/assets/app-v2/index-DcnYFKrN.js`; its public SHA256 matches the tested build.
Old hashed assets were retained. Authenticated public search returned five
relevant results in 985 ms; reading the official SearXNG Search API page took
327 ms and extracted 2,274 characters. Anonymous calls returned 401 and three
loopback/metadata/mapped-IPv6 probes returned 403.

A real Gemini 3.8 Live Extended Thinking/HIGH session, using the deployed setup
and existing chat history, connected in 276 ms after a 244 ms session request.
It called `search_web` (200, 722 ms) and `read_web_page` (200, 28 ms from cache),
then correctly explained `format=json` and cited the official SearXNG Search API
documentation in its spoken answer. First audio arrived after 1,490 ms; the full
spoken interaction took 43.8 seconds and ended normally. No native Google
Search, second model, task runtime or saved test transcript was used. This is
provider audio/tool verification, not a physical Safari microphone/speaker test.
End an existing voice session, reload the page, and start voice again to load
the new tools and source cards.

### Natural communication across organizations

A shared platform policy in `packages/shared/src/agent-communication.ts` makes
natural, candid conversation the default for current and future agents. It
covers direct answers, useful opinions, everyday wording, varied sentence
lengths and fewer canned acknowledgments or repetitive status updates. Roles,
individual personalities, assigned voices, tool permissions, approvals and
explicit output requirements remain intact. Written conversation uses ordinary
prose; structured reports and machine-readable responses still follow their
required formats.

Voice adds context-sensitive intonation, pacing and brief pauses. A soft laugh,
chuckle, sigh or exhale is encouraged only where appropriate, such as shared
amusement or relief, without forced laughter or theatrical repetition. Agents
are instructed to produce these expressions in audio, not read stage directions
or markup aloud, and to remain quiet during silence. These are native Live
prompting preferences, not deterministic timing or TTS markup controls. No
unsupported affective-dialog or speech-style API fields are added.

Managed text runtimes add the common policy once at their final prompt assembly,
through `joinAgentPromptSections`. This covers all twelve shipped model adapters,
ACPX and native execution, including resumed sessions and issue-less custom
heartbeats. Wake payloads and their empty/invalid semantics are unchanged, so a
communication default cannot suppress an existing custom prompt. Generic raw
HTTP and process adapters do not own a model prompt; their remote implementations
remain responsible for interpreting their own communication contracts.

The voice setup includes the policy for every company and agent, including
existing customized profiles. Its text participates in the instruction revision
fingerprint, so future policy edits are detectable by existing session checks.
Extended Thinking/HIGH, selected voices, English defaults, roster context and
Search quota recovery are unchanged.

Validation and rollout: 65 voice route/instruction tests and 136 focused runtime
prompt tests passed. Shared and adapter-utils typechecks passed. Wider adapter
runs had 234 passes and five existing WHOX/WHOXOS branding assertion
mismatches in unchanged default/wake text; those were not altered by this work.
All 18 published runtime modules imported successfully. Production patches apply
only the new shared policy/helper and final prompt joins to existing runtime
files, preserving unrelated installed code; equivalent source changes are in the
repository. Original empty-wake behavior, custom prompt retention and policy
deduplication were checked against the deployed helper.

After restart, health returned HTTP 200 and the service was active. Voice setup
checks for two different organizations retained Puck and Charon while including
both communication policies. One real Extended Thinking/HIGH/Charon response
completed with 385,920 audio bytes, no tool calls or stage-direction text, and
first audio after 862 ms. This was a short text-to-live-audio probe with Search
explicitly off to avoid the previously observed quota rejection; Search defaults
were not changed. No test transcript was saved. This validates provider acceptance
and audio delivery, not deterministic laughter, exact pause timing or physical
speaker quality. New text turns use the default immediately; restart an active
voice session to obtain its new bound instructions.

### Earlier Google Search rollout (superseded by SearXNG above)

The earlier Google Search rollout enabled Search alongside the six existing
NON_BLOCKING functions. New sessions include `googleSearch:{}` in both the bound
ephemeral token and client setup. Gemini 3.8 Live Extended Thinking/HIGH remains
selected; the change never starts Codex or another model. Search is for public
web facts, while organization tools retain their existing authorization and
approval checks. Web content is untrusted evidence, not instructions or tool
authorization, and private organization data must not be placed in search queries.

Live setup probes received a Google WebSocket 1011 quota rejection before
`setupComplete` with Search enabled. A control without Search connected. Token
creation succeeded in both cases. This does not identify the exact exhausted
Google project quota or establish that the API key is invalid. To preserve voice,
the client retries once without Search only after an initial, pre-setup quota
rejection. It keeps the same microphone, AudioContext, selected model, thinking
level, agent and chat, with one overall connection deadline. An explicit notice
identifies Search as unavailable for that session. A post-setup error or second
failure is not retried, and stop/account changes abort the replacement request.
The server accepts `searchGrounding:false` for this recovery; new sessions still
try Search by default.

Live grounding metadata is associated with the current spoken answer and shown
with Google's supplied Search Suggestions and source links in the floating
voice panel. Suggestions are sanitized before entering a sandboxed iframe with
no scripts or same-origin access; direct HTTP(S) links remain navigable. Metadata
is bounded, merged across streaming chunks and session-only, and is cleared on
new turns, stop and account changes. It is not persisted as arbitrary provider
HTML or passed into organization tools.

Validation and deployment: 208 client tests and 75 server/read-access tests
passed, including fallback cancellation, original-session revocation/reset,
model/thinking preservation, grounding rendering and source isolation. UI
typecheck, production build and token gates passed. Published entry:
`/assets/app-v2/index-UEalJEsx.js`; public health is 200, the service is active,
and the public JavaScript hash matches the built artifact. Old hashed assets
were retained to keep existing tabs loadable.

The postdeployment provider handshake reproduced the Search-enabled 1011 quota
rejection (158 ms), then accepted the same Extended Thinking/HIGH setup without
Search (201 ms). Both probe sockets were closed without sending a question.
Authenticated read-only organization tools returned HTTP 200: list_agents
returned 13 nonterminated agents in 97 ms, and overview returned a nonempty
result in 54 ms. These checks verify deployed configuration, provider setup
and API execution; they do not establish a successful grounded Search answer
or physical Safari microphone/speaker playback. The browser recovery path is
covered by the client tests. Existing voice sessions need to be ended and the
page reloaded to use the new client and setup.

### Fresh roster context for agent-count questions

The 16:45 UTC browser session again spoke a system error with no tool request or
API failure. Voice now fetches the roster at local speech onset, before releasing
that turn's audio. This supplies current evidence without relying on Gemini to
choose a roster tool. Extended Thinking/HIGH and the existing tools are retained;
no other model is called.

`GET /companies/:companyId/voice-sessions/:sessionId/roster` revalidates the owned
session, selected agent, chat generation, personal credential and read permissions.
It returns an uncached, server-timestamped count and minimal nonterminated agent
records, intersecting the member's and agent's permissions. The count describes
permitted agents, not hidden organization-wide data. A later page navigation
cannot change the voice session's captured organization.

The client buffers at most 750 ms or 64 KiB while reading. It sends the snapshot
with `clientContent.turnComplete:false` before activityStart/audio/activityEnd.
If the read fails or times out, an `available:false` marker invalidates previous
snapshots and ordinary tools remain available. Late results, replaced sessions
and cancellation cannot inject old context. Permission loss stops voice; local
playback still stops immediately when the user interrupts. No fetch occurs for
silence or after-the-fact transcript callbacks.

Three repeated real-audio tests with the exact candidate prompt, all six tools
and the existing 200-turn history correctly answered 13 accessible agents. There
were no false errors, unsolicited replies or injected text in input transcripts.
First audio followed speech by 1.55, 2.38 and 15.04 seconds: provider latency still
varies, so this is not a guarantee of instant replies. These were provider audio
stream tests, not a physical Mac speaker check. The mitigation covers fresh
roster/count answers; it does not establish that every Extended Thinking tool
selection failure is resolved.

Validation: 168 frontend tests and 73 route/read-access tests passed, along with
UI typecheck, production build and token gates. Published entry:
`/assets/app-v2/index-MGLEbyYb.js`. The service is active, public health returns
200 and the public JavaScript matches the tested build. Postdeployment roster
reads returned 13 with `Cache-Control: no-store` in 69 and 37 ms and contained
only the permitted agent fields. End any existing voice session and reload the
page to load the new client and prompt.

### Tool delivery and bounded task reads follow-up

The user’s 16:06 UTC roster request succeeded (HTTP 200, 47 ms), after which
Gemini spoke a failure matching an earlier assistant reply. Controlled tests
reproduced unsupported failures with no tool call, and after a delivered success,
including with a minimal instruction and empty history. A canonical `output`
wrapper also failed intermittently; the valid `result` envelope is retained.
These observations do not establish an HTTP, quota, credential or permission failure.

Task list reads now return authorized summary rows: id, identifier, title, status,
priority, assigneeAgentId, projectId and updatedAt. Full details remain available
through get_task; overview provides organization totals. The live 46-task list
fell from 145,145 to 13,294 JSON characters without changing its rows/statuses.
A controlled Extended Thinking run answered the seven-open-task question correctly
using this compact list and a corroborating overview call. Other minimal-session
agent-count turns still failed, so payload reduction alone is not a complete fix.

Each live tool call has an AbortSignal. Cancellation during asynchronous session
verification, transcript flushing or chat lookup prevents the subsequent operation.
Already-issued writes are neither rolled back nor retried. Local, bounded lifecycle
checkpoints distinguish requested, failed, cancelled and response-sent states;
response-sent means WebSocket.send completed, not a provider acknowledgment.
They include only allowlisted tool names, a session-local sequence and duration,
never call IDs, arguments, results, free-form errors or credentials. Startup and
tool checkpoints have separate 24/120 record caps and the same session authorization.

Validation: 151 focused frontend tests, 52 route tests and 21 disposable PostgreSQL
integration tests passed, including compact-list authorization/full-detail behavior,
cancellation, response delivery and diagnostic privacy. UI typecheck, production
build and token gates passed. The database suite must run as an unprivileged user
in this environment; root failed to initialize its disposable PostgreSQL cluster.
Deployment health and the public entry asset match were verified.

The owner explicitly retained Gemini 3.8 Live Extended Thinking after comparison
with the standard model. There is no standard-model or Codex fallback. The
existing HIGH thinking level remains unchanged: a LOW comparison also produced
an unsupported failure before making any tool call.

An independent Live baseline used a 230-character prompt, empty history and
exactly one NON_BLOCKING `get_agent_count` function. The first question called
the function and correctly answered 13; the identical second question claimed
a system error without calling the function. Both reached provider IDLE with
no transport, parser or API error. This demonstrates that the app's execution
path is not necessary to reproduce the remaining false error; it does not
identify the provider's internal cause. The intermittent failure remains
unresolved with the selected model.

HTTP logging now omits entire payloads, arbitrary headers and echoed errors
on voice diagnostics, tool and transcript routes, including rejected requests.
This closes a second logging path that could otherwise retain invalid diagnostic
bodies or JSON-encoded credentials in tool arguments. Allowlisted endpoint
checkpoints remain available. The HTTP privacy, logging policy and voice route
suites passed 139 tests, including 28 added real-HTTP privacy cases. The logger
was deployed with the tool changes; health returned HTTP 200 and the public
entry `/assets/app-v2/index-DevjheUp.js` matched the tested build.
Postdeployment authenticated requests to an expired voice session returned 403
on all three sensitive routes; journal entries retained route/status and redacted
the bodies, with no private canary text present. No provider session or task
mutation was started by these checks.


Function calling was temporarily disabled at the owner's request. The subsequent
request to fix system-status answers and ensure tools work restores the existing
six function declarations: current organization roster, current agent context, organization API, isolated
voice workspace, chat progress and explicit stop. Tool responses are handled by
the app. Google Search was disabled at this stage; the latest configuration above
enables it. Voice does not dispatch to Codex or another model. Direct task writes remain voice-owned, and connector/secret
approval requirements remain in force.

The user's subsequent spoken "system error" occurred with a healthy voice
connection and successful transcript writes; that session had no declarations
or tool calls. The voice instruction now requires actual current tool results
for live status, distinguishes dashboard/task reports from host health checks,
and restricts failure claims to returned errors. Ordinary tool-policy denials
are returned to Gemini while voice continues; session revocation, stale chat
generation, unavailable agent and credential failures still stop the session.
Local tool-completion logs contain allowlisted operation, outcome, status and
duration, never arguments, commands, results, transcripts or credentials.

Direct reads now intersect the signed-in member's and agent's access using
canonical resources, including row-filtered lists and session snapshots.
Approved connector retries reuse only the originating user's direct audit run
within the same organization, agent and chat. They retain signed arguments,
expiry, concurrent-claim protection and current policy checks; an approval
does not override a subsequently added block. These records do not launch a
model execution runtime.

Connector requests awaiting review return a structured pending result containing
the approval reference and `executed: false`, so Gemini can explain the next
step without treating review as a system failure. Other recognized gateway
failures preserve their HTTP status and bounded, redacted reason; raw provider
details and credential fields are not included.

Tool restoration validation: 195 focused tests passed, including 20 direct API
tests using disposable PostgreSQL databases and the real connector gateway.
UI typecheck, production build and design token gates passed. Direct server
typechecking reports only existing errors in issues.ts and native-runtime.ts,
not the changed voice files. Live authenticated checks passed for organization
overview, agents, tasks, projects, goals, connector discovery and isolated
workspace execution. A recorded-speech browser check called the real dashboard,
task and agent-context APIs through Gemini, then received a complete spoken
status answer and returned to Listening. It also recovered from deliberately
stalled playback peers using one direct audio route and passed End voice cleanup.
Test transcript writes were stubbed; no production tasks or projects were changed.
These checks verify software behavior, not the user's physical Mac acoustics.

A separate live recovery scenario injected one ordinary task-read policy denial.
Gemini received the specific reason, voice stayed connected, and an explicit
spoken follow-up reached successful dashboard/task reads and generated audio.
The strict browser fixture exceeded its 90-second answer-completion wait during
a long response, so this scenario verifies denial recovery rather than a full
final-IDLE/cleanup pass; the preceding normal scenario passed both.

Follow-up agent-count failure: the exact spoken question reproduced an unsupported
"system error" with no provider tool-call event or API request. Removing chat
history reproduced it too. Another run fetched all 13 agents successfully, spoke
the correct number, then contradicted it with an error. No provider error,
executable-code error or client exception was received. The delivered assets
matched the deployed build. The precise internal provider cause is unobservable;
the failure was not a rejected agent-count API request in these reproductions.

The tool catalog now offers a dedicated no-argument `get_organization_agents`
function. It calls the existing authorized, company-scoped agent list and returns
a compact roster and explicit count (paused/pending included, terminated excluded).
It does not fabricate a count for a denied, malformed or potentially truncated
response. The general organization tool advertises its supported actions as an
enum, with direct read examples, avoiding discovery for ordinary questions.
Version negotiation prevents parked older clients receiving a function they do
not implement. Permissions, asynchronous function execution and the selected
model are unchanged; Extended Thinking requires asynchronous tools per Google's
[Live capability contract](https://ai.google.dev/gemini-api/docs/live-api/capabilities).

Playback preparation now begins immediately after microphone permission and
AudioContext resume, overlapping the conversation and Gemini session requests.
The hook owns this prepared graph until it transfers the same instance and
readiness promise to the live controller. API failure, cancellation and late
playback rejection release the preparatory graph without starting a second one.
Capture-module loading, neural detector warmup, remaining playback preparation
and provider handshake then run concurrently. Capture starts only after all paths are ready; early
provider replies wait for playback, and cancellation releases and cleans up all
pending work. The initial progress lookup runs outside the startup critical path.
A real local RTC timeout is remembered for 60 seconds in the current document,
allowing repeat starts to use direct playback immediately; expiry retries RTC.
Permission failures never trigger that cooldown. This preserves browser permission
checks and prevents duplicate speaker routes. Unit tests prove concurrent startup
and timeout cooldown behavior; device permission and network delays still apply.

Final validation: 119 startup/audio/hook tests and 75 voice-route/roster tests
passed, alongside UI typecheck, production build and design token gates. The
deployed production browser check asked the exact agent-count question twice
using the existing 200-turn history, including its six prior system-error turns.
Both invoked the real authorized roster API, spoke the correct count of 13,
returned to provider IDLE/listening without contradicting the answer, and passed
End voice microphone/peer cleanup. Tool reads took 119 ms and 97 ms. With local
RTC negotiation deliberately stalled, click-to-listening was 5.397 seconds and
4.878 seconds; the second start created no RTC peers. Session creation took
311 ms and 253 ms, while post-session audio startup took 2.228 and 1.957 seconds.
An earlier build without pre-session playback preparation measured 7.276 seconds
on its first start; timings vary with browser warmup and provider latency. Test
transcript writes were stubbed and mutations blocked. These are controlled
recorded-speech browser checks, not qualification of the user's physical Mac.

Further startup profiling separated automation's pre-click wait from the actual
pointer press. The previous production UI spent roughly 2.9 seconds in browser
main-thread long tasks during a 3.8-second normal start; the chat and session
HTTP requests themselves took 52 ms and 266 ms. Four full-pane voice beam
renderers started during connection, competing with audio, provider messages
and neural worker readiness. The controls now appear immediately, while the
unchanged four-sided beams mount when voice leaves the connecting phase.

The authenticated, visible app now prepares one never-used neural speech worker
during idle time. Start adopts that same worker, including its pending warmup
if the click is early. An early click also begins static model preparation just
after requesting the microphone, in parallel with device and session setup.
Prewarming opens no microphone, AudioContext, credential request or Gemini
connection; only local model assets load. The unused worker expires after five
minutes and is cleared on logout/unmount. A used worker is never recycled:
stopping terminates it, and a later idle period prepares a fresh one, preventing
speech or recurrent state from crossing sessions. No spare worker is prepared
while classification is active. The three-second RTC fault deadline remains:
shortening it would discard a healthy echo-reference route on a busy browser.

Startup-only production verification after this change measured 1.389 seconds
from the actual pointer press to Listening on a fresh page with no intentional
prewarm wait; idle model preparation had naturally completed before the first
available click. A second start after explicitly waiting 1.407 seconds for idle
preparation connected in 0.677 seconds. Both retained connected local RTC peers
and passed End voice cleanup. Main-thread long-task time in those startup windows
fell to 590 ms and 249 ms. A fresh-page deliberately stalled RTC negotiation still
recovered safely through direct output in 3.236 seconds and passed cleanup. These
figures exclude the automation driver's pre-click wait; they are controlled
browser measurements, not guaranteed latency on every device or network.

The startup follow-up passed 156 focused tests (audio/controller/classifier,
idle scheduling and overlay behavior), UI typecheck, production build and design
token gates. Its final recorded-speech check received real audio and a successful
authorized roster response containing 13 agents, but Gemini again spoke an
unsupported system-error claim. There was no API, transport or UI error. Thus
faster connection is verified; the earlier intermittent semantic reply failure
is not fully resolved. The existing `response: { result: ... }` envelope matches
the [official Extended Thinking examples](https://ai.google.dev/gemini-api/docs/live-api/thinking)
and is permitted by the [FunctionResponse contract](https://ai.google.dev/api/generate-content#FunctionResponse).
It should not be labeled a protocol defect or changed merely to make an
intermittent test pass. The selected model and thinking level remain unchanged.
Two browser-only probes flattening the roster response also passed, but previous
unmodified responses passed too. They establish compatibility, not causality;
the experimental transformation was not deployed.

A live comparison with the same selected credential and model accepted both
connections, but provider activity detection produced no transcript or reply
after streamed speech. Explicit activity start/end markers produced both a
complete transcript and spoken response. The client therefore requests manual
activity framing and runs its neural speech detector automatically.

The detector warms up inference before capture begins and allows 250 ms for
worker results to drain after a microphone-message burst. Sustained backlog
still fails visibly; it never forwards unclassified noise. Safari playback
receives continuous silent frames before the first generated reply, preventing
startup from waiting on audio that cannot arrive until startup finishes.
Startup steps have deadlines. Worklet failure, missing capture frames, sustained
microphone muting, and interrupted audio contexts now produce actionable errors
or a bounded automatic resume attempt. Silent PCM remains a healthy input.

Validation: 119 focused UI/audio tests, UI typecheck, and production build
passed. Chromium and native headless WebKit both sent recorded speech through
the actual capture worklet, neural classifier, live Gemini connection, and local
WebRTC playback graph. Both transcribed “Hello, can you hear this audio clearly?”
and returned a corresponding answer with connected playback peers and no page
or voice errors. Test transcript persistence was stubbed to avoid adding test
messages to the user's chat. These software checks do not reproduce the user's
physical microphone or speaker acoustics.

The deployed site also passed the native WebKit recorded-speech check: full
input transcript, a matching answer, 124,322 bytes of generated audio, connected
playback peers, no page/voice errors, and microphone/peer cleanup on End voice.

Follow-up: the user still reported startup failure on macOS Safari. A further
ordering gap existed when Safari suspended the AudioContext during speech
detector preparation: playback awaited frames before resuming that context.
Playback now resumes before negotiation and monitors interruptions while
negotiating. Native WebKit tests explicitly suspending the context before
startup and during negotiation passed. The full recorded-speech app check
also recovered from a deliberately suspended context and returned audio.

Startup now distinguishes capture loading, speech detector loading, playback,
provider connection and microphone streaming in the voice bar. An authenticated,
session/owner/company-scoped diagnostics endpoint records only allowlisted
stage/context labels, coarse failure codes and elapsed time in local service
logs, at most 24 checkpoints per session. It rejects arbitrary fields and never
accepts transcripts, audio, error text, browser strings, or credentials.
Diagnostic delivery failure cannot stop voice. 138 targeted tests, UI
typecheck and production build passed for this follow-up. A user's physical
device result is still required to confirm their remaining failure is resolved.
The post-deploy WebKit check reached Listening, transcribed the full question
and returned 132,482 bytes of audio without page/voice errors. Its Linux headless
browser process then crashed during the End voice cleanup assertion, so that
post-deploy run is not counted as a complete browser-suite pass. The preceding
staged WebKit recovery run did pass the same cleanup assertion.

The next user screenshot exposed a browser `NotAllowedError` before session
creation. The manual start path requests `getUserMedia` in the original click
without awaiting a network call; the production site sends no microphone-denying
Permissions-Policy. Microphone denials now show browser-specific permission
instructions instead of the raw DOMException, and the floating error bar offers
Try voice again for the pinned agent. No automatic permission retries or Gemini
session requests occur when the microphone is denied. Tests cover denial,
resource cleanup and explicit retry after access is granted. The user must
allow the microphone in Safari's website settings; app code cannot change that
browser permission.

Subsequent session diagnostics isolated a separate failure: the microphone and
speech detector started and the AudioContext was running, but the browser's
local WebRTC playback peers did not connect before the deadline. Local WebRTC
playback is now preferred rather than mandatory. After three seconds without a
usable connection, or a peer/setup failure, playback tears down both peers,
the audio element and its silent stream before routing the same input gain to
the running AudioContext's output. An established connection also gets a
three-second recovery window if either peer disconnects; both peers must recover
to cancel that deadline. Old asynchronous callbacks cannot revive the discarded
graph or create duplicate outputs. Interruption immediately mutes either path.

Explicit browser autoplay refusals, pending autoplay on a connected peer, and
paused audio contexts are not bypassed. Direct playback lacks the explicit
remote-audio echo reference; native microphone echo cancellation and the neural
speech detector remain enabled, and capture continues during replies. Physical
speaker-to-microphone echo and macOS Safari behavior still need real-device
verification. Validation: 20 focused playback tests and UI typecheck passed,
covering connection/setup hangs, runtime failures/disconnections and recovery,
permission boundaries, interruption, stale callbacks and cleanup.

The staged app was tested with `RTCPeerConnection.createOffer` deliberately
left pending. Native WebKit and Chromium both recovered through direct output,
transcribed the complete recorded question, and returned a matching Gemini
answer. A WebAudio analyser measured nonzero rendered output (peak sampled RMS
0.307 and 0.338 respectively), with exactly one speaker route and both discarded
peers closed. Neither run reported page or voice errors. Chromium also passed
End voice cleanup. The Linux headless WebKit process crashed at that cleanup
assertion, so its run establishes startup and speech output rather than a full
browser-suite pass. Test transcript writes were stubbed to avoid chat pollution.
The combined focused checks cover 146 tests across six audio, hook, UI and
voice-route suites; UI typecheck, production build and design token gates passed.
After deployment, the same forced-hang Chromium check reached Listening in
5.45 seconds, returned the complete transcript and spoken answer (133,440 PCM
bytes, rendered peak sampled RMS 0.276), and passed microphone/peer cleanup.
It recorded `playback_fallback` before provider connection and Listening.

## Earlier integration capabilities

Voice uses the signed-in user's organization and normal board API permissions. Gemini handles conversation and Google Search directly. `organization_api` supports organization overview, agent listing/details/pause/resume, task listing/details/creation/update, and project listing/details/creation/update. It does not expose arbitrary URLs, credentials, or unrestricted HTTP access. Task lists are limited to 100 records; creating a task defaults to backlog. Explicit runnable assignments may start execution through the normal API.

Coding and runtime work use `send_agent_message`. Transcript persistence alone does not enqueue work or keep a completed execution active; an explicit dispatch promotes the transcript's receipt. Calls are deduplicated within a live connection. Task and project creation include a session-scoped idempotency key backed by their normal API's durable deduplication. Other mutations are not automatically retried after an ambiguous network failure.

Resource ownership and linked assignee/project ownership are checked before mutations. Normal API permission and validation errors are returned to Gemini. Returned agent fields exclude adapter credentials/configuration. API changes invalidate the UI query cache.

New clients request `audioTurnMode: "client"` when creating a voice session. The server binds disabled provider activity detection into the ephemeral token. The browser then sends activity markers automatically around continuous microphone input: 400 ms of pre-roll, at least 128 ms of confident speech, and one second without speech before ending a turn. A self-hosted Silero v5 neural classifier runs in a dedicated browser worker, with a 0.75 start threshold and 0.35 continuation threshold. If the classifier cannot load or falls behind, voice stops with a visible error instead of falling back to noise-sensitive energy detection. This preserves word beginnings and brief pauses without requiring push-to-talk. Older clients default to provider activity detection; newer clients also retain that path when an older server returns provider detection. The AudioWorklet captures mono PCM16 at 16 kHz in 20 ms frames with fractional sample-overlap resampling; the classifier processes and forwards 32 ms model frames. Runtime/model assets and licenses are served locally under `/voice-vad/`, and the pinned ONNX runtime assets are refreshed during the UI build.

Microphone capture continues during replies. Agent audio preferably plays through a pair of local WebRTC peers and an audio element, giving native browser echo cancellation a remote-audio reference. Both peers stay within the browser with no STUN/TURN or signaling server. If those peers cannot connect within three seconds or fail later, playback tears down that graph and uses the running AudioContext's direct output. An established peer disconnection has a three-second recovery grace. Direct playback has no explicit remote-audio echo reference; it does not bypass browser permission refusals or paused audio contexts. Capture requests echo cancellation, noise suppression and automatic gain control; browsers advertising the `all` echo-cancellation mode use it. Confirmed neural speech immediately stops queued PCM and mutes buffered playback, sends an activity-start interruption, and suppresses late reply packets until the provider acknowledges interruption. The server explicitly configures `START_OF_ACTIVITY_INTERRUPTS`. A new reply resumes after the short playback buffer drain; the microphone is never gated by playback. Interrupting speech does not cancel background agent work. Native AEC quality depends on browser, device and room acoustics; it cannot guarantee suppression of every echo. The neural classifier rejects common non-speech sounds, but no detector can guarantee perfect separation of speech from every noise. Other people speaking and speech in media can still count as speech; this is not speaker identification. English is a provider transcription hint and model instruction, not a deterministic language guarantee. Production speech quality still requires real-device/acoustic testing.

Provider-only no-speech/noise markers, including partial marker fragments, are suppressed before chat callbacks. The persistence endpoint ignores them, voice context omits them, and historical voice-marker bubbles are hidden without deleting real messages. Incoming provider messages are decoded in order. Input and output transcript fragments are accumulated independently and persisted to chat without dispatching every utterance. A save failure stops voice rather than executing unrecorded work. Background results wait for both provider `IDLE` and local speech/playback completion; `turnComplete` alone does not mean background reasoning has finished. Reset boundaries are enforced by their durable database cursor even if the reset marker is deleted or falls outside the latest comment page.

Voice sessions and call maps are process-local. A server restart or dropped connection requires restarting voice; seamless session resumption is not implemented. Stopping voice flushes transcripts already received but can lose an unfinished utterance that the provider has not transcribed yet. Provider events do not include stable utterance IDs, so severely delayed transcription events remain a qualification concern.

Starting voice permits immediate reconnects, including after provider failures. Credential creation is limited to ten attempts per user/organization in a rolling minute, with a `Retry-After` response for excessive bursts. Invalid requests and failed agent/settings validation do not consume this allowance. There is no per-start cooldown.

## Verification — 2026-09-26

398 targeted automated tests passed: 295 chat/UI/tool/hook tests, 44 audio capture/activity/protocol tests, 20 voice route tests, 34 conversation integration tests, and 5 organization-isolation integration tests. The 39 database tests used disposable real PostgreSQL databases, not production records. UI typecheck, production UI build, and design token gates passed. Full repository verification was not run; the server-wide typecheck is blocked by unrelated missing runner dependencies in this checkout.

The browser integration check verified restored context, separate visible user transcripts, one explicit execution submission, direct organization reads, deferred background result delivery, and microphone shutdown. Its provider and organization responses are simulated. Its microphone uses silence while provider messages are simulated; recorded speech and noise are exercised separately.

Before the neural speech gate was added, eight real Gemini scenarios passed with constrained ephemeral tokens and the then-current setup/controller: conversational trivia, direct organization lookup, explicit coding delegation, a name correction without delegation, two clean English recordings, a recording at 15% amplitude, and one with seeded background noise (approximately 15 dB SNR). All four recordings produced the complete expected English transcript. Provider tool responses were simulated, so these cases did not modify real organization data. The tests use synthetic speech and do not measure the user's microphone, accent, room, speaker echo, or performance over a long session. These results do not establish an error-free production guarantee.

For physical microphone placement and vocabulary improvements, see Google's [speech input guidance](https://docs.cloud.google.com/speech-to-text/docs/best-practices?hl=en) and [dedicated Live Transcription documentation](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe). Dedicated transcription supports language and vocabulary biasing; it is a possible separately evaluated improvement, not a feature currently enabled in the conversational audio pipeline.

The subsequent noise-filter change passed 185 UI/protocol/classifier-lifecycle tests, 24 route tests, and 15 shared marker-filter tests (224 total), plus UI typecheck/build and token gates. A real Chromium worker loaded the shipped ONNX model and rejected silence, fan-like hum, static, and keyboard-like impulses while accepting clean, quiet, and noisy synthetic English recordings and short yes/no replies. The browser chat check also verifies historical noise markers are hidden and actual messages, tool results, and microphone cleanup still work. These are controlled software tests, not acoustic qualification of the user's room.

The full-duplex interruption update passed 245 chat/audio/tool tests (including the added startup-readiness case), 24 route tests, UI typecheck/build and the token gate and a real Gemini interruption scenario: speech interrupted an ongoing story, the provider acknowledged the interruption, transcribed the new English question, and answered it with audio without delegating. A real Chromium check verified local WebRTC audio packets/energy, immediate playback muting, resume and cleanup. The headless container requires disabling mDNS ICE obfuscation for this loopback check because its multicast name resolution is unavailable; application clients keep browser privacy defaults. These checks do not reproduce physical speaker-to-microphone echo in the user's room.

## Agent identity and assignments — 2026-09-26

Each constrained voice setup now includes a server-built snapshot of the exact agent and organization: name, role, title, capabilities, runtime type, configured skill keys, open assigned tasks and queued/running executions. No adapter environment, raw runtime configuration or credentials enter this snapshot. Tasks exclude chats, hidden records and completed/cancelled work; bounded lists include truncation flags. The session-bound `get_agent_context` tool refreshes this data on status/capability questions without launching a coding run. Chat ownership, organization and reset generation are checked again for refreshes.

Voice speaks as the agent in first person. Own code/private-runtime work uses the existing chat execution path; another agent's work is assigned through normal task APIs with the named colleague as assignee and `todo` for an explicit start request. The controller obtains a server permission decision before task writes, checking both the current voice agent and board user against the actual task/project/assignee scope. Normal task APIs retain their own authorization, validation, idempotency and scheduling. This preflight is part of the voice controller, not a replacement for normal API authorization or a new credential with unrestricted access. Permission denials must not be routed around through the runtime.

Assigned, queued, running and completed work are explicitly distinguished. The prompt requires successful tool responses before claims about mutations and first-person status reporting. These are model instructions; live testing can check behavior but cannot guarantee every generated sentence.

Validation: 83 UI/controller tests, 31 route/shared tests and 7 disposable PostgreSQL integration tests passed, including own-task filtering, refreshed reassignment, reset fencing and foreign-assignee denial. Browser integration verified the identity lookup alongside transcripts and execution. Four real Gemini scenarios exercised identity/current work, own execution, colleague assignment and denied delegation with simulated tool responses and no production task writes. UI typecheck/build and design token gates passed.

## Canonical agent instructions and automatic synchronization — 2026-09-26

Voice now reads the agent's configured instruction entry through the same `agentInstructionsService` used by the Instructions editor. Entry contents are included verbatim, plus referenced Markdown files within that bundle. Legacy custom prompt/bootstrap templates use the shared template renderer with safe identity fields. There is no separately generated role/persona. The configured instructions take precedence over a generic database role classification; transport/tool/language instructions remain voice-specific. Unrelated bundle files, adapter environment values and raw credentials are excluded. Missing configured entries or instruction payloads over the bounded voice limit fail visibly rather than silently dropping instructions.

A content revision covers resolved instructions, identity fields, configured skill keys and voice preferences. Active voice checks it every three seconds through a session/owner/organization-scoped endpoint. On a change, after the spoken turn, playback and tool responses settle, it flushes transcripts and opens a fresh constrained Gemini session with the latest instructions and the same persisted chat. It does not create a new chat or cancel runtime work. Three consecutive verification failures stop voice visibly. This reconnection is necessary because [Gemini Live session configuration cannot be changed on an open connection](https://ai.google.dev/api/live#session-configuration). Changes apply between turns, with a brief connection transition; there is no instantaneous mid-utterance prompt replacement.

Identity/role questions are answered from the loaded instructions without an identity lookup or narrated tool call. Live Gemini testing with the actual CEO instruction text and its generic database role returned “CEO, the Chief of Staff for WHOXOS” directly with zero tool calls. Tests cover exact source text, referenced identity files, revision changes, safe template inputs, missing-source failure, automatic client refresh, cancellation during refresh, and sustained verification failure.

## Direct text answers (2026-09-26)

Text chat now answers self-contained agent-count, agent-list, and the current
agent's assignment/status questions directly from company-scoped database rows.
`conversation-quick-answer.ts` recognizes complete factual questions only. It
uses the same per-resource authorization service as the list APIs, excludes
terminated agents and hidden/closed tasks, and distinguishes assigned work from
work marked in progress. Unrecognized/compound requests, attachments, and replies
while a clarification is pending retain the normal runtime path.

The ordinary authenticated comment endpoint atomically saves the user's question
and the agent's answer under the conversation row lock. Its server-owned metadata
marker excludes the already answered turn from both durable outbox recovery and
pending-turn settlement. Retry IDs still reject different content and deduplicate
concurrent requests. Existing execution state and session boundaries remain
unchanged. No model call, runtime startup, or skill lookup is needed for these
answers. This is a targeted latency improvement, not a replacement text model.

Validation: `conversation-quick-answer.test.ts` plus the persistent conversation
suite cover routing, company/owner access, live facts, assignment states,
concurrent retries, durable outbox behavior, and fallback to normal execution.


### Organization identity and people context — 2026-09-27

Voice startup and each authenticated per-turn roster read now include the human
speaker, active human members, current membership roles, owners, and the permitted
AI employee roster with reporting relationships. Human and AI counts remain
separate. The agent-count compatibility field still counts permitted AI agents.
Owner membership is displayed as **Founder / Owner**, an organization authority
convention rather than a claim about historical incorporation. Administrator,
operator, and viewer roles remain distinct; actual scoped permissions and approval
requirements continue to govern every operation.

`GET /api/companies/:companyId/organization-context` is a fresh, non-cacheable
directory read. The voice `organization_api` action `get_organization_context`
returns the same context using the authenticated voice speaker and the selected
agent's intersected access. It resolves locally, preserving the human identity
instead of confusing the forwarded agent JWT with the speaker. The result includes
existing data discovery paths for tasks, projects, goals, task documents, skills,
and connectors; those endpoints still authorize their own resources. It contains
no credential values, personal account records, email addresses, or adapter config.

Managed text runtimes receive the same directory at final prompt assembly on new
and resumed runs. Stored message authors, authenticated speakers, and execution
responsibility are separate fields. Background work never assumes the responsible
user is speaking. Runtime-only data is rebuilt server-side and is not trusted from
caller-supplied context. Restricted skill-test/task-bridge runs do not acquire a
broader directory through prompt injection. A directory-only update does not turn
an empty wake into a resume delta or suppress an agent's configured prompt.

Membership changes are reflected on the next directory read/run, with no shared
cross-organization cache. Revoked membership is rejected; hidden AI records and
reporting references are removed. Native recovery retains its persisted execution
input, and can use the authenticated directory endpoint to refresh current facts.


Verification for the organization-context rollout: 72 voice route/instruction and
shared configuration tests; 22 direct API PostgreSQL tests; 14 directory service
and HTTP tests with real PostgreSQL/canonical authorization; 149 focused runtime,
helper, and native cases; and 2 new Hermes prompt cases passed. Adapter-utils
typecheck passed. Full server typecheck remains blocked by seven unrelated
existing diagnostics in issue and native feedback/coordinator code; the wrapper
also hits the existing runner build prerequisite. The independently enabled full
Hermes suite retains four pre-existing branding expectations. No UI bundle change
was needed.

Production verification on 2026-09-27: all 24 changed runtime modules imported,
health returned ready, authenticated directory/voice-roster/direct-tool reads
returned 200, and the installed final prompt helper retained the custom prompt
and verified directory. Live Gemini 3.8 Extended Thinking (HIGH) identified the
signed-in owner by name, the other human administrator, and the separate human/AI
counts correctly, returning audio with no tool error. Search was disabled only
for this smoke session because of the previously observed Search quota response;
stored model and Search settings were unchanged. No smoke-test transcripts were
persisted and no other model runtime was started. Active voice sessions should
be restarted to receive the updated bound startup instructions.
