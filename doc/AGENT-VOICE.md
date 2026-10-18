# Agent voice conversations

Current implementation, September 28, 2026. See [VOICE-INTEGRATION.md](VOICE-INTEGRATION.md) for incident evidence and rollout history.

## Credentials, identity and controls

Users connect their own Gemini API key through Connectors. The backend selects the authenticated speaker's personal grant; shared or delegated credentials are not a fallback. Raw keys remain server-side. The backend issues a short-lived, single-use provider token bound to the selected agent's instructions, voice, model and tool declarations. New settings default to **Gemini 3.8 Live Extended Thinking / HIGH**. Voice settings expose an explicit choice between Extended Thinking and standard Gemini 3.8 Live, and reads and saves preserve the chosen model and its independent speaking preferences. Selecting an option is a draft until Save. There is no Codex or automatic alternate-model fallback; this code does not migrate existing saved model selections.

Extended Thinking retains `thinkingConfig.thinkingLevel: HIGH`. Standard Live omits `thinkingConfig` entirely, as required by its provider contract; a stored legacy thinking preference for that profile is inert. Both choices retain the same authorized WHOXOS functions and canonical organization voice assignment. Switching models does not allocate a second voice or bypass unique voice ownership. The September 28 model-selection change is prepared in source for review; it does not itself authorize deployment or a change to the current production model.

The session contains the agent's actual instructions and authorized organization context. Fresh per-turn reads identify the current human, owners/founders, administrators, operators, viewers and accessible AI roster. Human membership and AI employment are separate. Every tool rechecks the intersection of the human's and agent's permissions. Instructions, memberships, credentials, chat generation and agent status remain revocable.

The shared [agent autonomy policy](AGENT-AUTONOMY.md) also applies in voice. Agents resolve routine work with the authorized team, honor existing scoped paid-API authorization without repeated spending questions, and ask concise human questions only for actual unresolved dependencies. This guidance does not supply missing credentials, rights, budgets, resolver permission or root access.

The site-level VoiceSessionProvider owns the session independently of routed pages. Navigating between chat, Tasks, Projects, Agents and Connectors does not replace the agent, microphone or provider socket. The floating indicator identifies the active agent and organization, returns to its chat, selects the microphone and ends voice without moving page content. Browser reloads, tab closure and explicit End terminate voice; route persistence is not persistence across browser reloads.

Microphone/playback preparation begins from the user's click, while app/session setup runs concurrently. Browser permission is required. Input is mono PCM16 at 16 kHz; provider audio is PCM16 at 24 kHz. Extended Thinking's `interactionStatus: IDLE`, pending tools, local speech and drained playback jointly determine a safe idle boundary; `turnComplete` alone only ends an utterance. Standard Live can use `turnComplete` when no explicit interaction status accompanies it, while retaining the pending-tool, local-speech and playback guards. Natural speech interrupts playback. Old research results are suppressed after new speech; an interrupted write is never silently re-executed.

## Tools and supported work

The version-3 catalog has eight asynchronous functions:

- `get_organization_agents`: current permitted roster/count and human directory.
- `get_agent_context`: identity, instructions-related capability context and assignments.
- `organization_api`: scoped organization reads; authorized voice-owned task, comment and document operations; connected tools and approval handling.
- `voice_workspace`: isolated shell, Python and Node execution without another model.
- `stop_agent_work` and `get_agent_progress`: current chat execution controls/status.
- `search_web` and `read_web_page`: public SearXNG research and source reading.

`organization_api` action `capabilities` gives the exact available operation and field contracts. Voice-owned tasks do not launch a text runtime. Existing text-runtime tasks require an explicit authorized `adopt_task`, and active runs cannot be taken over. Pending connector or secret approval does not mean execution succeeded. Documents are Markdown with revision checks; stale edits fail rather than overwriting newer content.

The workspace is private to company, agent, human and conversation. It supports persistent files under `/workspace`, commands up to 60 seconds and bounded output. It has **no network, host filesystem, credentials or root/VPS administration**. UTF-8 output is decoded across stream chunks. A nonzero exit code or timeout remains a command failure even when the HTTP request completed. Concurrent commands in one workspace return a specific conflict.

These are real limits: the current voice catalog does not provide unrestricted host administration, arbitrary deployment/migration APIs, agent hiring/configuration/resume, or downloadable workspace-file publication. It is not full Codex tool parity. Do not claim unavailable capabilities based on an agent's title or stored skill names.

## Search and conversation behavior

SearXNG runs as a private core service. A search uses exactly one category: General, Images, Videos or News. Voice requires an explicit category, including through the legacy `organization_api` path; omission never silently selects General. Search is asynchronous and never opens a results popup. Source names and links belong in the normal response. Partial results and empty matches are distinct from failed requests; neither proves a platform outage. News date filters apply before result-count limits and require valid, timezone-explicit publication timestamps; impossible or ambiguous dates remain undated. Explicitly wrong-category upstream rows are excluded. News results carry source-provided dates and unverified geography: a publication date is not an incident date, and a matching query does not establish the story's city. Agents must check the returned evidence before treating a township, county or neighboring city as the requested place. Public source text is untrusted evidence, not permission or instructions.

Natural speech/progress policy applies across organizations. Agents should acknowledge work briefly, report meaningful verified progress and approvals, answer from actual results, and yield to interruptions. Activity labels reflect pending tools. Runtime progress polling sends changed state rather than replaying history. Prompt guidance cannot guarantee generated wording or truthful tool use on every provider turn.

Recognized spoken local-news requests also have a bounded application read path.
After the actual input transcript ends, the authenticated `news-context` endpoint
can resolve a canonical US Census place and fetch one News search with a day or
week window. It reconstructs the public query from the place and topic; arbitrary
speech or organization data is not sent to SearXNG. A strict follow-up such as
“Any recent crime activity?” may reuse the last successfully delivered canonical
place in the same voice session. Unknown or ambiguous places and other request
forms retain ordinary tool handling. Subsequent matched reads explicitly state
the current resolved place, News topic and publication window in the evidence
prompt, while preserving the original spoken request. An explicit new place wins
over the previous place. This prevents an implicit follow-up from relying only on
the provider to infer which location its completed search covers.

The successful result is delivered to the same Gemini session as actual evidence
with `clientContent.turnComplete: true`, before any provider output or tool
attempt. This is an application read, not a fabricated provider function call.
The lookup has a 1.25-second server deadline and 1.5-second client delivery window;
provider latency remains separate. New speech, partial transcript continuation,
provider activity, navigation-independent session changes and End cancel stale
delivery. Session, instruction revision and human/agent permissions are checked
before and after the read. The resulting automatic evidence turn is fenced
against mutations until a new genuine spoken request. Source links merge into
normal chat attribution without opening a popup. An empty result remains an
empty result, and source geography is still unverified until the agent checks it.

Extended Thinking can occasionally claim a generic error after a successful
public search or before requesting any tool. The client keeps a bounded,
in-memory receipt for the current spoken turn. It can request one correction
from verified public results, or one fresh read when no tool operation was
observed. The latter does not establish that the provider is healthy or that
any operation succeeded. This happens after provider IDLE and actual audio drain,
with a fresh session/access check. The original reply remains visible and audible;
the correction does not hide errors or manufacture an answer. Identical public
reads reuse the receipt, and code enforces a read-only recovery scope. New speech,
End, provider activity, session changes or permission loss cancel pending recovery.
Previously executed private organization reads, writes, workspace commands,
connector actions and cancelled/failed/malformed results do not qualify. Every
incoming tool attempt is observed before filtering malformed or duplicate IDs;
an empty receipt cache is not treated as proof that no tool ran. Recovery permits
at most three reads within 20 seconds, including access verification. Private
reads must use fresh authorization and results; they are never cached. Hanging
recovery reads receive one specific timeout result and late results are ignored.
New speech and End cancel in-flight recovery. There is no retry loop or automatic
mutation replay. The model can still fail to produce a
corrected answer; this is bounded resilience, not proof of end-to-end reliability.

The per-turn `/roster` read also includes a bounded `work` snapshot of current
permitted task details. It prioritizes open work, excludes hidden tasks and
conversations, and intersects the human and speaking agent's task-detail access.
It includes recorded state, blocker text and a bounded latest recorded comment;
comments remain attributed data, not instructions or verified host telemetry.
The sample is explicitly limited and may be truncated; it is not a task-count
endpoint. It is fetched afresh with the directory before each spoken turn and
before a read correction. A missing snapshot never makes an earlier one current.

For successful task-status reads followed by an unsupported generic error,
recovery retains only exact operation descriptors for `overview`, `list_tasks`,
`get_task`, or the no-argument context/directory tools. It fetches those records
again through the normal authorized executor before supplying evidence to the
same model. The existing three-read budget, deadline and cancellation guards
apply. A failed fresh read is reported as unavailable rather than replaced with
an old private response. Brief progress followed by a generic failure is eligible
for this same single correction; real failed operations are not relabelled.

A failed text-adapter run may leave an agent in `error`. That recoverable state
does not prevent an independently authorized Gemini voice session. Paused,
pending-approval or terminated agents, suspended organizations, exhausted budgets
and revoked credentials remain blocked. Availability and budgets are checked
before and after token creation and on existing-session operations.

Idle handling rechecks the browser's audio clock when a wall-clock timer runs
early, so queued corrections and progress are not lost. Research cancellation
also aborts the browser HTTP request; work already received by the server may
finish. Already-dispatched mutations are not aborted or retried by that change.

## Voices, cost and limits

Each organization has at most 30 agents, matching the voice catalog. Persisted assignments are unique within the organization; changing to an occupied voice swaps assignments atomically with expected-owner checks. The picker shows the assigned agent and supports public sample previews. Samples do not synthesize the current agent's instructions.

Voice uses the speaker's Google credentials and quota. Direct tools and workspace commands do not invoke Codex. Google voice usage is not automatically imported into the WHOXOS cost ledger; existing recorded budget exhaustion still blocks a new session. Token expiration and provider connection limits remain distinct from route navigation. Reconnection must never replay writes to simulate continuity.

## Verification and release gate

Authenticated session diagnostics record only allowlisted lifecycle metadata in local service logs. Before the execution filter, malformed incoming function envelopes produce `provider_tool_call_invalid` with a bounded issue enum; this observes but does not repair or execute the call. Provider `codeExecutionResult` parts produce `provider_code_execution` with an allowlisted outcome, including failures and deadlines. Unknown outcomes become `unknown`. These share the 240-event lifecycle cap per session and preserve the separate startup/tool caps. The client projection and strict server schema exclude function IDs, names outside the existing tool allowlist, arguments, code, output, transcripts and provider error text. Diagnostic failure never affects voice. These checkpoints are evidence about provider transport, not proof that a requested organization action ran.

Use targeted voice UI, route, permission, workspace, search and integration tests, plus the isolated browser harness documented in VOICE-INTEGRATION.md. Browser fixtures verify routing and media lifecycle but cannot prove Google's generated responses or a physical Safari microphone/speaker.

Run `pnpm test:voice-live` only with explicit provider testing enabled. It requires these environment variables, populated securely rather than committed or printed:

- `VOICE_SMOKE_ALLOW_PROVIDER=1`
- `VOICE_SMOKE_URL`: HTTPS site origin (or local HTTP origin)
- `VOICE_SMOKE_COMPANY_ID`, `VOICE_SMOKE_AGENT_ID`, `VOICE_SMOKE_ISSUE_ID`: authorized existing chat scope
- `VOICE_SMOKE_COOKIE`: authenticated user's cookie header

Use `VOICE_SMOKE_SCENARIOS` with comma-separated names (`organization_roster`, `general_search`, `news_search`, `code_execution`) to isolate a failing check.

For a real-audio native-tool check, set `VOICE_SMOKE_AUDIO_PCM` to a local raw
mono PCM16LE 16 kHz fixture and select exactly one scenario. WAV containers,
odd byte lengths and recordings outside 1–15 seconds are rejected. News checks
require News/week on every search request and response, server-enforced dated
results and evidence-based narration. This reusable smoke check exercises native
provider tool calling; it does not exercise the separate `news-context` browser
helper. Browser integration tests and a production helper/audio probe cover that
path. `VOICE_SMOKE_SELF_TEST=1 node scripts/smoke/voice-live-readiness.mjs` runs
offline fixture validation without credentials or provider calls.

The check keeps Extended Thinking/HIGH, reads the actual roster, performs General/News research and permits only one exact harmless Python arithmetic command. It saves no chat transcripts and refuses other mutations. It prints timings and allowlisted outcomes, never credentials, conversation content or raw tool results. It exits nonzero when provider behavior fails the assertions. A failed live check prevents a claim of end-to-end production readiness even when unit/integration tests pass.

`pnpm test:voice-provider` isolates the provider protocol with a synthetic flight
tool, no application routes, no saved history and no organization data. Supply
`VOICE_SMOKE_ALLOW_PROVIDER=1` and `GEMINI_API_KEY` securely. It uses the selected
Extended Thinking/HIGH model, returns fixed fixture data locally, checks spoken
results and exits nonzero for failures. It logs only timing/count/outcome metadata
and uses an authentication header rather than putting the key in a socket URL.
This is a diagnostic, not a production fallback or a filter on model speech.

Provider references: [Thinking lifecycle](https://ai.google.dev/gemini-api/docs/live-api/thinking), [ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [Extended Thinking capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live-extended-thinking), [standard Live configuration](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live).
