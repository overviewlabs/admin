# Voice conference calls

A voice call can include five agents from its originating organization. Use **Add
to call** and select participants, or ask the speaking agent to add an agent by
name. The conference panel shows connection and speaking status, provides **Give
turn**, and lets the user remove participants. The `conference_call` tool exposes
list, add, handoff, and self-leave. Ambiguous agent names require clarification.

Each participant uses its own Gemini Live session, configured voice, instructions,
and server-authorized tools. A shared floor admits microphone audio and playback
for one participant at a time. Attributed transcript context is held locally and sent to a participant when
they take the floor. Partial transcripts are not broadcast repeatedly. Handoffs give another agent the
floor; agents must not impersonate each other. Membership does not grant another
agent's permissions. Existing text conversations continue to use their configured
Codex runtime.

Conference transcript updates are saved as one attributed Conference Call comment
in the original chat. The participant sessions remain tied to that chat's user,
organization, and reset generation. Pending invitations count against capacity.
Ending the call closes local microphone clones and provider sessions, drains
transcripts, then invalidates the server sessions. Provider quotas and revoked
credentials can still prevent a participant from joining; join tones play only
after successful connection. Call, join, leave, failure, and hangup tones are
original quiet synthesized tones.

Run the targeted Vitest conference/voice tests and
`node node_modules/@playwright/test/cli.js test --config tests/voice-browser/playwright.config.ts voice-conference.spec.ts`
for browser coverage. The browser suite exercises real browser audio and UI with
synthetic microphone and provider responses; it does not establish live provider
quality or physical microphone behavior.

## Shared Gemini allowance

Voice sessions advertise a 65,000 input-token/minute target. All organizations and
credentials on this single API process share one admission budget (Google limits
projects, not keys). The server grants at most 60,000 estimated tokens per rolling
62 seconds, leaving 5,000 headroom and covering the 2-second allocation lifetime.
The browser preserves message order while waiting and cancels queued input on
hangup or floor removal. The UI displays “Waiting for voice allowance”. Expiring
startup credentials are not retried indefinitely. Text chat is unchanged.

Recent startup history is limited to 8,000 characters; full history is still
stored. Provider context compression triggers at 12,000 tokens and targets 6,000;
Google retains system instructions. Provider prompt usage updates the next-turn
estimate. Admission estimates include locked setup, text, PCM audio, retained
prompt on generation triggers, and tool replies. These estimates are not an
exact Google tokenizer or billing ledger. Usage from other applications in the
same Google project, request/session quotas, and billing limits can still cause
provider rejection. No alternative model is started.

The allowance is process-local and resets on API restart. Before deploying more
API replicas, move it to a shared atomic store; do not multiply the allowance by
replica, key, organization, or participant. Existing browser sessions must be
restarted after deploying this version to adopt pacing.
