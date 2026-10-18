# Voice tool diagnostics — 2026-09-28

The reported generic “system error” can occur before Gemini sends a function
request. It also occurred after a valid function response. These are different
from an WHOXOS executor returning an HTTP error.

## Reproduction

Tests used the user's authorized Gemini connection, without saving transcripts,
changing organization records, or starting a Codex runtime. Standalone tests used
one synthetic function and no organization history. Application checks used the
configured agent instructions, 200 saved conversation turns, the existing eight
function declarations and the authenticated organization tool routes.

Extended Thinking/HIGH reproduced the false error with both the standalone
fixture and real application reads. Removing empty no-argument schemas did not
resolve it. In the three-operation application check, task lookup and public
search produced no function request and a generic error; sandbox Python ran and
returned the correct result. No WebSocket error or malformed function frame was
observed in those three turns.

Other isolated comparisons did not establish a reliable Extended Thinking fix:
omitting NON_BLOCKING, changing the response wrapper, and adding direct-call
instructions all still produced failures. Keep the documented NON_BLOCKING
declarations and existing result envelope; do not deploy those speculative
variants as fixes.

## Verified alternative

With the same full application configuration, regular Gemini 3.8 Live and no
thinkingConfig completed all three checks:

| Operation | Tool request started | HTTP duration | Verified result |
| --- | ---: | ---: | --- |
| Read TASK-20 | 722 ms | 116 ms | Correct current blocked status |
| General public search | 979 ms | 738 ms | Three results and an accurate sourced answer |
| Sandbox Python calculation | 893 ms | 84 ms | Actual stdout 55, exit code 0 |

These are text-input provider checks with generated audio output, not physical
microphone tests or a guarantee of future provider reliability. A separate
browser test covers standard Live tool completion across navigation in Chromium
and WebKit, including pending operations and microphone/socket cleanup.

## Application changes

- Respect an explicitly saved voice-model choice; keep Extended Thinking/HIGH as
  the default. Preparing or deploying this support does not select a new model.
- Omit thinkingConfig for regular Live. Its turnComplete ends a turn; Extended
  Thinking requires interactionStatus IDLE. Never use the regular fallback for
  an unknown model or an explicit IN_PROGRESS frame.
- Retain existing authorization, tool cancellation and response deduplication.
- Record bounded malformed-call and provider code-execution outcome metadata.
  Never record argument bodies, code, raw output, credentials or provider IDs in
  these diagnostics, and never execute provider code parts as local commands.

Use the checks in [AGENT-VOICE.md](AGENT-VOICE.md) to reproduce provider failures.
Successful executor tests alone do not establish successful model tool use.

## Validation and rollout

- 406 targeted shared, server, UI, authorization and transport tests passed.
- Chromium/WebKit regression: 31 passed; one WebKit offline-service-worker
  emulation test was explicitly skipped. The standard Live lifecycle test passed
  in both engines.
- UI and server TypeScript checks, token gates, and shared/server/UI builds
  passed. The server's prerequisite wrapper remained blocked by a pre-existing
  missing `ajv` dependency in whoxos-runner; the direct server compiler passed.
- Deployed the two changed backend modules and the UI build on 2026-09-28.
  The supported hot restart completed at 09:41 UTC with zero lost agent runs.
  Health, agent and voice-assignment endpoints returned HTTP 200; the served UI
  entry is `/assets/app-v2/index-CqjzHtlE.js`.
- No saved model was switched: all 15 persisted selections remain Extended
  Thinking (two voice-enabled). Changing to regular Live awaits the user's
  answer because they explicitly selected Extended Thinking earlier.

The Extended Thinking native-tool reliability problem remains unresolved. This
rollout supplies the verified alternative and diagnostics; it must not be reported
as proof that Extended Thinking has been repaired.
