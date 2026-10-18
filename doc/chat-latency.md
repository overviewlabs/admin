# Chat response latency

Admin chat responses include native-agent connection/preparation, model reasoning,
tool execution and final answer generation. The displayed elapsed time covers the
whole turn, rather than the external API call alone.

Native Codex and Claude receive the full current OpenUI/weather contract through
system instructions on both new and resumed sessions. Their user-message history
contains only the actual user request (and a bounded transcript when seeding a
new native session). Other adapters retain their existing presentation fallback.
This prevents roughly 40 KB of repeated catalog text from being added per turn.
Existing native history is preserved; the change does not rewrite stored turns.

The default reasoning effort is now fixed at medium, in both the root Codex
configuration and `admin.codex_reasoning_effort` in the Admin worker's persistent
configuration. All native Codex chat workspaces resolve this default on each turn,
including resumed threads, lookups, plans, desktop tasks and attachments. This
prevents Codex's sticky previous-turn effort from preserving an old low/high level.
The previous lookup classifier and the proposed auto policy were removed.
Explicit chat effort and service tier overrides continue to take priority.
Daybreak/security models retain their access program. No model switch or additional
routing-model request is added. Unknown model families retain native defaults.
Image prompt preparation follows the same default without changing image quality.

The agent is instructed to reuse confirmed locations and fresh data, avoid
unnecessary planning/tool-discovery/clock steps for lookups, and render the native
component promptly after retrieval. Current UTC time is supplied with the turn.
Tool permissions, tenant checks, data attribution and normal verification remain
in force. Weather continues to use its bounded lazy cache, with no polling or
background workers. Provider/network and model generation latency still varies.

Verification uses the Admin worker's standard-library unittest runner for
`tests/test_chat_latency.py`, the Daybreak/error regressions, and temporary live
chat requests to measure first visible output, tool timing and final completion.
Temporary verification chats are deleted after the run.

The measured original weekly-forecast turn took 48.7 seconds, including 0.49 seconds
for the weather fetch. After the changes, temporary normal chat requests completed
in 12.8 seconds (current weather), 16.6 seconds (weekly forecast), and 4.3 seconds
(short acknowledgement). These are measured examples, not latency guarantees.
Those earlier retests used low effort for lookups and high effort for a
subsequent reasoning question; they predate the fixed-medium preference. Weather
needed one tool step without discovery.
The mobile forecast card rendered in both themes. Nineteen focused tests passed.
