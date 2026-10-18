# Admin recovery and model settings — 2026-10-02

Added native WHOXOS Admin settings with the available model list and a persisted cptr `chat.default_model` setting. Accessible from Admin navigation and the contextual account Settings link. Existing chats, existing scheduled tasks, and organization-agent settings are unchanged. Saving refreshes the embedded frontend's default-model store. The prior default was restored after the save/reload test; the operator can choose a preferred model.

Admin route failures now notify the host, which remounts the embedded app once and replays the selected view. Repeated failures show an explicit reload action. The embedded Svelte error page replaces its generic 500 screen with a recovery view. Navigation failures reset command deduplication so a failed request can be retried. Appearance observers are cleaned up when the bridge unmounts.

The reported 500 was not reproduced in fresh Chromium or WebKit sessions, including repeated Scheduled/Dashboard/Monitor navigation. Its original cause remains unconfirmed; the recovery change is not proof that every possible 500 is eliminated.

Verified live: default-model save and reload persistence, contextual Settings link, injected error recovery, Dashboard, actual Codex chat response, UID 0 terminal command, temporary workspace file write/read, actual scheduled Codex execution, Monitor and former Monitor redirects. Test artifacts were removed. Main UI typecheck/build and token gates passed. cptr check: 0 errors, 207 warnings.

Rollback distributions: `/.WHOX/.System/overview-labs/deploy-backups/admin-recovery-settings-20261002T063414Z`.
