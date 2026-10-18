---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `whoxos run`

One-command bootstrap and start:

```sh
pnpm whoxos run
```

Does:

1. Auto-onboards if config is missing
2. Runs `whoxos doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
npx whoxos run --instance dev
```

## `whoxos onboard`

Interactive first-time setup:

```sh
pnpm whoxos onboard
```

If WHOXOS is already configured, rerunning `onboard` keeps the existing config in place. Use `whoxos configure` to change settings on an existing install.

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm whoxos onboard --run
```

Quickstart defaults + immediate start:

```sh
pnpm whoxos onboard --yes
```

When onboarding starts WHOXOS from an interactive terminal, it opens the
onboarding page in your browser once. Non-interactive terminals stay silent.
Suppress browser opening explicitly for headless or automated runs with either
environment variable:

```sh
WHOXOS_NO_BROWSER=1 pnpm whoxos onboard --yes
WHOXOS_OPEN_ON_LISTEN=false pnpm whoxos onboard --yes
```

On an existing install, `--yes` now preserves the current config and just starts WHOXOS with that setup.

## `whoxos doctor`

Health checks with optional auto-repair:

```sh
pnpm whoxos doctor
pnpm whoxos doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration, including AWS Secrets Manager non-secret env
  config when selected
- Storage configuration
- Missing key files

## `whoxos configure`

Update configuration sections:

```sh
pnpm whoxos configure --section server
pnpm whoxos configure --section secrets
pnpm whoxos configure --section storage
```

`--section secrets` updates the deployment-level provider used as the fallback
for secrets that do not target a specific company vault. Per-company provider
vaults (named instances, default vault selection, multiple vaults per provider,
coming-soon GCP/Vault) live in the board UI under
`Company Settings → Secrets → Provider vaults` and the
`/api/companies/{companyId}/secret-provider-configs` API.

## `whoxos env`

Show resolved environment configuration:

```sh
pnpm whoxos env
```

This now includes bind-oriented deployment settings such as `WHOXOS_BIND` and `WHOXOS_BIND_HOST` when configured.

## `whoxos allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
npx whoxos allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.whoxos/instances/default/config.json` |
| Database | `~/.whoxos/instances/default/db` |
| Logs | `~/.whoxos/instances/default/logs` |
| Storage | `~/.whoxos/instances/default/data/storage` |
| Secrets key | `~/.whoxos/instances/default/secrets/master.key` |

Override with:

```sh
WHOXOS_HOME=/custom/home WHOXOS_INSTANCE_ID=dev pnpm whoxos run
```

Or pass `--data-dir` directly on any command:

```sh
npx whoxos run --data-dir ./tmp/whoxos-dev
npx whoxos doctor --data-dir ./tmp/whoxos-dev
```
