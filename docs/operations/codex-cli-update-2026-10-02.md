# Codex CLI update — 2026-10-02

Installed stable npm release `@openai/codex@0.160.0` for the host/Admin CLI, live organization runtime, runtime ACP dependency, source runner and ACP dependency, npx cache, and both installed VS Code extensions. Running editor sessions retain their loaded executable until restarted; new processes use the updated binary.

Source dependency pins are synchronized in the runner package, root pnpm overrides, workspace overrides, ACP patch, and lockfile. Organization model metadata now includes `gpt-6.1-sol` with the full Sol reasoning range. Existing agent model selections were preserved. Admin model discovery reports GPT-6.1 Sol, GPT-6 Astra/Sol/Luna and earlier supported models. All three organization model APIs include GPT-6.1 Sol.

## Validation

- Host, editor, npx, runner and ACP CLI versions: 0.160.0.
- Adapter metadata tests: 4 passed.
- WHOXOS UI build: passed (existing chunk-size warnings).
- Live Admin model save/reload, contextual settings, dashboard recovery and Monitor: passed after restart.
- Live Admin Codex root command execution: passed with ordinary auto chat parameters; test file and chat cleaned up.
- GPT-6.1 Sol root command execution after restart: passed.
- Root terminal, workspace file read/write, and scheduled Codex execution (waited for the completed assistant response): passed.
- Runtime module import and public health endpoint: passed. Task drain is off; active runs were zero during restart.
- Post-validation runtime customization snapshot: `deploy-backups/codex-0160-verified/runtime-customizations.tgz`.

## Deployment recovery

Installing Codex with npm inside the deployed application install unexpectedly reinstalled bundled application packages. Restored custom server/shared/db/adapter outputs, latest UI, branded strings, heartbeat skill, bundled mail service and its nodemailer dependency, patched ACP adapter, and production runner vendor files before the final successful restart.

The restored task-identifier migration SQL had a checksum different from its existing applied-history entry. Verified all tasks, hold identifiers, organization counters, and both unique indexes matched the migration, then reconciled only that history checksum. No task data was changed. Prior history record is saved under `deploy-backups/codex-0160-verified/migration-history-before.json`.

For subsequent CLI-only updates, install into an isolated versioned prefix (as in `/opt/openai-codex/0.160.0`) and replace only the Codex package/native binary or launcher. Do not run npm install in the customized live application prefix. Preserve the deployed application and adapter patches. Rollback editor binaries remain in `deploy-backups/codex-0.160.0-editor`.
