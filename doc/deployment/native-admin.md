# Native Admin workspace

Admin renders inside the WHOXOS React application at `/OVE/admin`. It remains an instance-administrator workspace in the organization switcher, not an ordinary tenant with agent staffing. It uses the same sidebar, theme tokens, controls, dialogs, and mobile shell as other organizations.

The native views are dashboard, conversations/chat, terminal, scheduled tasks, workspace files/Git changes, and monitor. Admin has a dedicated Settings interface at `/OVE/admin/settings/models`, built from the same layout and controls as organization Settings. `ui/src/pages/AdminPortal.tsx` dispatches the views. Heavy terminal and chat clients load only when selected. There is no embedded Admin application or postMessage navigation bridge.

## Backend and identity

The existing root Admin worker remains under the single `WHOXOS.service` supervisor. Its HTTP and WebSocket endpoints are exposed through the existing authenticated `/admin-portal` gateway. The React client uses these APIs directly; existing workspace and chat records are preserved. The gateway continues to enforce WHOXOS instance-administrator authorization.

`ui/src/api/native-admin.ts` establishes the backend's HttpOnly session through the gateway's `/admin-portal/api/auth` endpoint before calling APIs or connecting a root terminal. This replaces the session bootstrap previously performed by the embedded frontend. Query caches are scoped to the signed-in WHOXOS user. Root access is enforced by the existing backend, not a browser-supplied role.

Socket.IO carries chat events, with snapshot refresh on reconnect and polling when the socket is disconnected. Tool call updates are merged by call ID and type; the transcript follows the selected message branch. Terminal sessions use the existing authenticated binary WebSocket protocol and persist when navigating between views. Explicitly closing a terminal terminates it.

The account-menu Settings link and mobile Settings shortcut open Admin's own settings routes. The duplicate Settings row beneath Monitor has been removed from the Admin sidebar. The settings sidebar contains Models and Back to Admin; organization membership, secrets, and governance settings are not mixed into this page. It uses the standard Settings sidebar frame, form widths, typography, spacing, theme tokens, and shared controls. Instance-admin authorization and official organization identity are still required. Ordinary organization settings do not show or fetch Admin models. Legacy `/OVE/admin?view=settings` and `/OVE/company/settings/admin-models` links redirect to the dedicated page. The existing backend authorization remains unchanged.

Model settings persist `chat.default_model`. New conversations and schedules use the configured model when available, otherwise the first available model. Existing conversations and schedules retain their own model. Schedule times use the server's UTC timezone.

## Backend correction included

The deployed cptr source at `/.WHOX/.System/.Admin/whox-admin-fresh/payload/.Admin/.System/.whox/cptr/source/cptr/utils/git.py` now supports unstaging before a repository's first commit. With a valid HEAD it uses `git restore --staged`; with an unborn branch it removes only index entries using `git rm --cached -f`. Working files are retained, including edits made after staging.

Regression tests are beside that backend in `cptr/tests/test_git_unstage.py`. Preserve this correction when upgrading the Admin worker.

## Validation performed on 2026-10-03

- UI TypeScript check and production build; design token gates.
- Seven frontend regression tests for conversation branches, stream merging, and model defaults.
- Two backend tests for unstaging in new and existing repositories without losing working contents.
- Production Chromium: create/delete temporary workspace; create/edit/save files; root terminal input/output and direct reload with no existing backend cookie; scheduled task create/edit/history/manual execution; model settings; streamed chat invoking `id -u`, reporting UID 0, and completing.
- Git browser workflow: view diff, stage, and unstage in a new temporary repository.
- iPhone WebKit: all native views, no horizontal overflow or embedded application, viewport-fitting dialogs, 16px inputs, and visible chat send control.
- Unauthenticated terminal/config API requests return 401. Public UI permissions and the service health check pass.

Temporary test data was removed and the original unset default model restored after checking settings. Real-device microphone/voice functionality is outside these native page checks.

## Deployment

The 2026-10-03 frontend entry is `/assets/app-v2/index-D73BAvCi.js`. The UI publisher copied assets before index/service-worker entry points, retained older hashed assets, and verified public directory/file modes (0755/0644). A rollback copy of replaced entry points is at `/tmp/overview-native-admin-backup-20261003T015647Z` with the deployment manifest `/tmp/overview-native-admin-release.json`. The main API was not restarted. The idle Admin worker was restarted separately by its existing supervisor to load the Git correction.

Admin model settings relocation verified on 2026-10-03: 21 settings/account-menu tests, UI typecheck/build and token gates, Chromium save and return navigation, iPhone WebKit sizing and settings navigation, and normal-organization visibility checks. The original default model was restored after the save check.

The shared settings release entry is `/assets/app-v2/index-DtY2I6on.js`; manifest: `/tmp/overview-admin-model-settings-release.json`. Frontend-only publication required no service restart.

Dedicated Admin settings published on 2026-10-03 with entry `/assets/app-v2/index-CMUAr6LF.js` and manifest `/tmp/overview-admin-own-settings-release.json`. Validation: 27 settings/navigation tests, UI typecheck/build, token gates, and Chromium/iPhone WebKit navigation and layout checks. Real model-save verification restored the original default afterward.


## Admin attachment and tool-result correction (2026-10-03)

The Admin adapter previously treated Markdown links to directories as file deliveries, producing false `Is a directory` failures labeled “Agent tool”. Linked directories and special files are now excluded from attachment discovery; real file delivery errors remain visible and are labeled “Attach file”. Source references with line numbers retain their existing navigation behavior.

The Codex adapter also discarded completion payloads (`aggregatedOutput` and MCP results/errors), relying solely on output deltas. It now persists completion results, including empty results, and replaces partial streamed output with the authoritative final payload under the existing size caps. This follows the [app-server item lifecycle](https://learn.chatgpt.com/docs/app-server).

These backend fixes and eight regression tests are preserved in `scripts/patches/admin-tool-results.patch`. Apply/reconcile this patch against the cptr source when upgrading the Admin worker. The deployed editable source is the path documented above, with `artifacts.py`, `codex.py`, and `chat_task.py` changed. Run `venv/bin/python -m unittest discover -s tests -p 'test_*.py'` from the cptr source (using the actual Admin venv path).

Validation: all 13 tests in that backend tests directory passed. An authenticated live Admin chat ran two harmless printf commands, saved both results through reload, published a temporary report file, and ignored two directory links without failure. The test chat was removed. The two specific synthetic directory-attachment failures in the reported completed conversation were removed after backing up its output and portable export to `/tmp/admin-tool-fix-20261003T165301Z`. Actual command records and assistant text were preserved. Only the idle Admin worker was restarted; the main API remained healthy.

Admin chat activity now uses the same `TaskChatTurn` fold as organization chat. Historical command rows are collapsed under one Worked/Stopped summary beside the timestamp and copy action. Live tools appear inside the shared expandable working status; pending approvals and questions remain outside the fold. Commands and their output are retained for inspection. Verified with 54 targeted tests, UI typecheck/build and token gates, desktop Chromium and iPhone WebKit expand/collapse checks against the reported conversation, and the send/upload/approval/stop/draft-preservation browser fixture. Published UI entry: `/assets/app-v2/index-DPkGfiG4.js` (2026-10-03), no backend restart.

## Shared Admin chat verification (2026-10-03)

Admin now uses the shared attachment chips/image viewer, persisted composer drafts, progress/thinking presentation, and reply feedback controls in addition to the shared bubbles, composer, and activity fold. Drafts are scoped to the signed-in user and conversation in session storage; uploaded attachment receipts are restored for sending after reload. Generated file links resolve to authenticated Admin downloads. Connected sessions also refresh snapshots periodically to recover updates made in another tab.

Feedback is private to the Admin backend and persists in message metadata and the portable chat export. The endpoint verifies chat ownership, message membership, assistant role, and completion before saving. It does not enable external feedback sharing. Preserve `scripts/patches/admin-message-feedback.patch` when upgrading cptr. Question option buttons now have independent accessible names, and the shared feedback buttons expose their pressed state.

Validation: 100 targeted frontend tests, 19 backend tests, UI typecheck/build, and token gates passed. Chromium and iPhone WebKit verified attachment chips, image viewing, thinking/activity folding, text/upload draft restoration across reload, sending the restored upload, live progress, answering questions, queue removal, and persistent feedback selection. Separate browser fixtures checked sending, stopping, approvals, uploads, and failed-send draft preservation. The deployed backend completed a temporary real chat with two harmless shell commands, retained both outputs, delivered a downloadable report, and persisted feedback through reload. Temporary conversation and source report were removed; API health returned 200.

Published entry: `/assets/app-v2/index-BK-4I6_W.js`. Rollback entry-point backup: `/tmp/overview-admin-sidebar-cleanup-backup-20261003T172551Z`. Public UI permissions passed. Only the idle Admin worker was restarted for the feedback endpoint. The main API was not restarted.

This establishes shared text-chat presentation and the tested interactions; it does not establish complete organization-feature parity. Admin has its own root execution context, approval modes, and model settings. Organization Gemini voice/conference sessions and agent reassignment are not wired to the Admin conversation backend.

### Admin live status correction (2026-10-03)

Admin had selected the experimental `TaskChatStatusPill` through the generic turn fold. That component deliberately replaces generic labels with rotating words such as “Sketching” and “Organizing”, unlike the normal WHOXOS live status. Admin now opts into the same `TaskChatLiveRunPill` used by the normal chat presentation: Working, spinner, elapsed words, and actual command/tool counts. Provider progress and the inspectable activity fold remain available, and completed activity retains its Worked/Stopped summary.

Validation: 32 targeted status/turn tests, UI typecheck/build and token gates, plus desktop Chromium and iPhone WebKit checks holding an active turn beyond the former label-rotation interval. Published entry: `/assets/app-v2/index-kj939L7Q.js`; rollback entry-point backup `/tmp/overview-admin-sidebar-cleanup-backup-20261003T173253Z`. Frontend-only update; no service restart.

### Execution-based animated activity for all chats (2026-10-03)

At the user's request, the experimental pulse/shimmer indicator is restored for Admin and organization chat, with execution-based labels instead of time-based random words. Active tool identities resolve through the shared taxonomy (search, read, command execution, editing, and other operations). Explicit reasoning and response events show Thinking or Responding. Pending questions/approvals show the corresponding wait state; queued runs wait to start. Without a specific active event, the fallback is Working. Completed, failed, and interrupted tools no longer supply an active label, including repeated lifecycle updates and concurrent calls.

This covers native Admin, the normal organization thread, the shared task-chat live tail, and the native runner's rolling activity. Existing history, expanded tool output, progress text, and terminal summaries remain available. The runner keeps real provider activity labels and adds the pulse/shimmer to active rows.

Validation included 191 targeted tests across the activity resolver, status indicator, turn folds, native runner, activity groups, and normal organization thread; UI typecheck/build and token gates; desktop Chromium and iPhone WebKit transitions through search, file reading, commands, completion, thinking, responding, and a pending question. An active search was held beyond the previous rotation interval to verify that its label remains stable without a new event.

Published entry: `/assets/app-v2/index-DnI1VqO0.js`; rollback entry-point backup: `/tmp/overview-admin-sidebar-cleanup-backup-20261003T174856Z`. Frontend-only deployment, no service restart.

### Admin progress and preparation visibility (2026-10-11)

An Admin turn resumed a large conversation and spent about 110 seconds compacting
its history before emitting commentary. It then worked through organization
provisioning errors. The worker was active; the generic Working label hid the
preparation stage. Its organization/team creation finished and requested an
OpenAI sign-in for the new team's connection.

Native Codex now emits separate activity records for connection, context
compaction, provider reconnection, and a quiet wait for the next update. These
records drive the live status without becoming assistant prose or tool counts.
The quiet-wait status appears once after 45 seconds without notifications, only
when no observed tool, compaction, or retry is active. It makes no model request.
Control RPCs have bounded waits (30 seconds; 60 for thread opening/resumption;
5 for interruption). The model turn itself remains event driven.

Tool tasks request concise public commentary before work and at least every
60 seconds when the agent can respond. Completed commentary is persisted;
streaming remains separate from final answers. Admin snapshots omit expensive
context calculation and preserve authoritative completed output over older live
state. Live progress renders through MarkdownBody. Image-only native requests
retain their existing direct generation behavior.

Backend changes and tests are preserved in
`scripts/patches/admin-live-progress.patch`; apply to the editable cptr backend
when upgrading. Only the idle Python Admin worker was restarted by its supervisor;
the main API continued running. The missing small teams catalog was restored to
both the installed fallback and the persistent server-home package location.

Validation: 15 backend lifecycle/tool tests, 17 Admin state/presentation tests,
26 shared-turn tests, UI TypeScript, production build and design token gates.
Authenticated production Chromium verified real streamed commentary, final
completion, visible preparation status, rendered Markdown, and catalog HTTP 200.
The temporary verification chat and browser credential were removed. Receipts:
`/root/admin-progress-20261011/verification.json`.

### Conversations across workspaces (2026-10-11)

Admin → Conversations and the dashboard's recent list/count now include the
signed-in user's Home chats and conversations from all workspaces. Workspace
conversations carry a tag using the workspace's display name, with a path-name
fallback if the workspace is no longer registered. Opening a row passes that
conversation's own workspace. Dedicated workspace views retain their scoped list.

The backend's opt-in `GET /api/chats?all_workspaces=true` reads owned conversation
metadata directly from the primary database rather than scanning workspace files.
Internal/subagent chats and other users' conversations remain excluded. The `q`
parameter searches titles and workspace names before sorting/pagination. Home and
workspace clients that omit the new flag retain their portable folder behavior.
Frontend search uses this query, resets pagination, and has the same length cap.

Backend changes and regressions are preserved in
`scripts/patches/admin-all-workspace-conversations.patch`. Validation: four backend
and five frontend regressions, UI TypeScript, production build, and token gates;
authenticated production Chromium confirmed all five existing conversations,
workspace tags, workspace-name search, and correct conversation/workspace links.
Receipts and screenshot: `/root/admin-conversations-20261011`. The idle Admin
worker was reloaded separately; main API and resource limits were preserved.

### Conversation list presentation (2026-10-11)

The combined conversation list now uses individual cards with workspace/chat
icons, a clearer heading and conversation count, and groups by Today, Yesterday,
Previous 7 days, and Earlier in the browser's local timezone. Workspace tags use
a blue-tinted surface with readable dark-mode text. Titles wrap, timestamps omit
seconds, and Rename/Delete live in an accessible actions menu with the existing
confirmation dialogs. Pagination appears only when needed. Recent workspace and
dashboard lists use the same card treatment without date-group headings.

This changes presentation only: the existing metadata requests, refresh cadence,
workspace routing, search, and ownership rules remain in place. Production UI
publication retained old hashed assets and required no service restart.
Validation: five existing list regressions, UI TypeScript/build and token gates;
production Chromium checked light/dark/mobile presentation, workspace search,
Rename/Delete dialog opening and cancellation, and no horizontal mobile overflow.
Screenshots and receipts: `/root/admin-conversation-design-20261011`.

### List1 conversation layout (2026-10-11)

The main, recent, and workspace conversation lists now share
`AdminConversationList`, replacing the dated cards above with the public
Shadcnblocks List1 table layout: icons, aligned workspace/conversation/date/status
columns, subtle dividers, and narrow status markers. Colors and fonts come from
the site's semantic tokens. Workspace tags and the existing action menus remain.
Narrow containers stack the metadata beside the icon and actions, leaving room
for titles; container queries also handle lists beside the desktop sidebar.

The official `@shadcnblocks/list1` installer was attempted in isolated staging,
but this Pro block requires an API key. No Pro source was installed; the layout
was independently adapted from the public reference with existing components.
No new runtime dependency, backend request, worker, or polling was added.

Validation: five conversation regressions, TypeScript, production build, token
gates, and authenticated browser checks of light/dark/mobile layouts, search,
and action-dialog cancellation. UI publication retains old hashed assets and
needs no service restart. Receipts: `/root/admin-list1-20261011`.

### Site cursor (2026-10-11)

Overview Labs mounts one `SiteCursor` in the shared UI entry point, including
Admin and organization pages. The rounded arrow is now smaller (24 × 26.4 CSS
pixels), solid black in light mode and solid white in dark mode. Trail, glow,
outline, shadow, and their animation/history code have been removed. Geometry
and theme colors use tokens in `ui/src/index.css`.

The decoration is a non-interactive body portal above dialogs. Native text/editing,
resizing, drag, busy, and unavailable cursors remain. Embedded frames keep their
own cursor. Touch is excluded. Position updates use DOM refs rather than React
renders, with at most one requested frame per mouse-movement batch and no idle
animation, request, or server worker. Leaving the page, scrolling, dragging,
hidden tabs, and blur restore the native pointer. Teardown removes every event
listener and frame callback.

Verification receipts and light/dark screenshots:
`/root/site-cursor-monochrome-20261011`. Original glow/trail implementation
receipts remain in `/root/site-cursor-20261011` for history.
Production build, UI TypeScript, and token gates passed. Authenticated browser
checks confirmed both solid theme colors, the smaller size, absent effects,
working menus/native editing, blur cleanup, and zero cursor updates while idle.

### Site right-click menu (2026-10-11)

The shared UI entry point mounts `SiteContextMenu` alongside the application,
using the existing Radix dropdown primitives, semantic colors, and site fonts.
It handles right clicks in the main document and React portal dialogs, keeps
the custom cursor over the menu, supports keyboard navigation/Escape, and fits
the viewport. The menu closes on route changes, outside clicks, scrolling the
page, or window blur; scrolling within a long menu remains available.

Actions adapt to selected text, editable fields, HTTP links/images, the active
organization route, and Admin/workspace context. AI actions prepare a new
account-scoped, tab-local Admin composer draft (or a task draft for users without
Admin access); they never send an AI turn automatically. Selection summaries
and writing revisions use at most 12,000 characters. Password/private fields
are excluded, URL credentials are redacted from AI context, and unsafe URL
schemes cannot open through the menu. Task creation opens the existing review
dialog. Conversations, workspace files/Git, integrations, and monitor shortcuts
use existing permission-controlled pages. Admin detection handles company
prefixes, and integration links preserve the actual organization prefix.

Copy/cut/paste/select-all preserve field selection and controlled input events.
Browsers that deny clipboard access receive a keyboard-shortcut fallback
message. Permission lookup runs on demand, reuses the Admin cache, and does
not poll. There is no new server worker or external integration execution.
Browser-owned chrome and embedded external documents retain their own menus;
cross-origin frames do not forward right-click events to the parent document.

Receipts and screenshots: `/root/site-context-menu-20261011`.
Validation: ten focused regressions, UI TypeScript, production build, and token
gates. Authenticated Chromium checked light/dark presentation, custom cursor,
Shift+F10 and Escape, rapid reopening and screen-edge placement, paste/search
events, selection-to-visible-AI-draft handoff with zero submitted turns, task
review, and correctly scoped integration navigation. Main API stayed running;
only UI assets were atomically published, and maintenance limits were restored.

### Basic right-click actions only (2026-10-11)

The expanded site menu above is now disabled. Blank page areas suppress the
browser menu and show no custom menu. Editable fields offer paste/select-all
and selected text offers copy/cut as appropriate. Read-only fields retain
selection/copy without mutation; password/private content is never exposed
as a copy selection. HTTP links and images offer standard open/copy-address
actions. AI, task creation, navigation, integrations, theme controls, branding,
and page-link actions have been removed, along with the menu's permission
query and AI-context collection/draft code.

Clipboard fallback, keyboard controls, custom cursor, focus restoration, and
viewport placement remain. Embedded external documents still own their menus.
Receipts and screenshot: `/root/site-basic-context-menu-20261011`.

Validation: five clipboard/context regressions, UI build/typecheck and token
gates passed. Live browser checks verified blank-area suppression, copy/cut/
paste/select-all with React field updates, contextual link/image basics and
keyboard open/dismiss without browser errors. UI assets were atomically
published without restarting WHOXOS; maintenance memory limits were restored.

### Gray selected sidebar tabs (2026-10-11)

Selected sidebar tabs now use neutral gray in both themes, with dark text in
light mode and light text in dark mode. The shared sidebar-primary tokens also
update selected agent rows and collapsed navigation pills, including hover.
This preserves contrast with the black/white site cursor without changing its
appearance or adding effects. Receipts: `/root/sidebar-gray-20261011`.

UI build and token gates passed. Live browser checks confirmed gray selected
tabs with a visible contrasting cursor in both themes and no browser errors.
Published UI assets without a service restart; restored maintenance limits.

### One cursor for all site controls (2026-10-11)

The site pointer now uses CSS cursor SVG assets with the same compact arrow
shape: black in light mode and white in dark mode. A global important rule
overrides text, resize, drag, busy, disabled and pointer cursor declarations
across the page, including editors and portalled menus. Input editing,
selection and resizing keep their existing behavior. The old React cursor
overlay, mouse listeners, per-target exclusions and animation-frame updates
have been removed. There is no cursor JavaScript or idle work. Touch-only
devices keep their normal behavior. Browser chrome, native dialogs and external
iframe documents remain under the browser or embedded site control.
Receipts: `/root/site-cursor-unified-20261011`.

UI build/typecheck and token gates passed. Live browser checks verified the
custom asset over 16 cursor variants in each theme, editable fields, navigation
and context-menu items, with no browser errors. Assets published without a
service restart; maintenance memory limits restored.

### Shared simple-ai chat input (2026-10-11)

Installed the upstream `@simple-ai/chat-input` and input-group registry files
through the shadcn CLI after previewing its changes. Existing Button/Input/
Textarea primitives were preserved; registry adapters use the app utility and
tokens. Only TipTap editor dependencies were added; the app continues to own
AI transport, so this input does not add an AI SDK runtime. Upstream license
is preserved under `ui/public/licenses/simple-ai.txt`.

All main chat composers use the input: Admin and workspace conversations,
agent/task threads (both presentations), board chat, comment replies and rich
question/revision inputs. Their existing submit, stop, voice, access mode,
assignee, file upload, draft recovery, queue editing and pause/takeover flows
remain with their owners. The adapter keeps Markdown source and identity links
intact and supports entity mentions and capability-aware slash commands.
Controls use the current monochrome theme and global custom cursor. No idle
worker or polling was added. Receipts: `/root/simple-ai-chat-input-20261011`.

Validation: the six targeted composer/editor suites passed (240 tests after
rechecks), including a mixed-image/document paste regression that prevents
duplicate document attachment. UI build/typecheck and token gates passed.
Live Chromium, desktop WebKit and mobile WebKit checks passed for typing,
Shift+Enter, Markdown, draft reload, access/attachment controls, light/dark
themes and basic editing menus; no browser errors or server writes occurred.
Published UI assets atomically without restarting WHOXOS. Removed the duplicate
inner focus outline so the composer remains a single control. Maintenance
memory limits restored; temporary browser credentials deleted.

### Visible simple-ai composer layout (2026-10-11)

The initial editor replacement retained the old padded task-chat shell. The
shared task composer now wraps its editor, attachment list and toolbar in one
`ChatInput`, with the toolbar in `InputGroupAddon` at `block-end`. Admin,
workspace, agent and task chats use this composition. Board chat uses the same
addon and compact shell. The shell uses the site's medium radius and a visible
neutral border in both themes rather than the old borderless dark background.
The mention and attachment buttons sit together on the left. Voice remains
available for empty agent chats, alongside a disabled Send button; typing
enables Send. Access modes, assignment, queue editing, uploads, pause, uncertain
submission and stop behavior retain their existing guards. No worker, timer or
server change is introduced.

Validation: 128 targeted composer/editor tests, UI typecheck and design-token
gates passed. Publication and live browser receipts are stored in
`/root/simple-ai-composer-layout-20261011`. The live Studio Team Lead page was
checked specifically because the previous browser verification covered Admin
but missed the outer layout on agent chats.

UI build passed and 20 updated files were published atomically, with the index
last and existing hashed assets retained. Chromium, desktop WebKit and mobile
WebKit passed on the live Studio Team Lead and Admin routes: single input shell,
toolbar placement, mention insertion, empty-draft Send, attachment/access
controls, typing, Shift+Enter, draft reload and distinct light/dark backgrounds.
Browser checks blocked server writes (including automatic read receipts) and
triggered no AI requests. No browser errors occurred. WHOXOS remained active;
maintenance memory limits were restored and temporary browser credentials
removed.

### Rounded chat inputs (2026-10-11)

Shared bordered chat inputs now use the site's `--radius-2xl` token for softer
corners. The separate mention button has been removed from the shared task
composer used by Admin, workspace and agent chats. Typing mentions remains
available through the editor. Attachment, access, voice and send controls are
unchanged. Receipts: `/root/chat-composer-rounded-20261011`.

UI build and token gates passed. Desktop and mobile WebKit verified rounded
corners and the absent mention button on live Admin and Studio Team Lead chats
in both themes, along with typing, draft reload and the remaining controls.
Assets were published without a service restart. Maintenance memory limits were
restored and temporary browser credentials removed.
