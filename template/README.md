# Install a fresh instance

Requirements: Docker Engine with Compose v2, Python 3, and enough disk space to
compile the included Node and Rust workspace. Node 24.11+ and pnpm 9.15.4 are
required for native source development. The build downloads its dependencies.

From the repository root:

```sh
python3 template/configure.py
docker compose --env-file .env -f template/compose.yaml up --build -d
docker compose --env-file .env -f template/compose.yaml logs -f app
```

Visit `http://localhost:3100` and complete the first-admin bootstrap on this trusted
local connection. The database has a newly generated password, and both auth and
tool-action signing keys are generated separately for this install. State persists
in the Compose project's `database` and `application` named volumes.

For a remote host, first use an SSH tunnel (`ssh -L 3100:localhost:3100 YOUR_HOST`).
After claiming the first administrator, configure your HTTPS reverse proxy and set
`WHOXOS_PUBLIC_URL` in `.env` to its canonical URL. The app port binds to loopback;
PostgreSQL has no published host port. The application runs in authenticated mode.
See `doc/DEPLOYMENT-MODES.md` for exposure and invite behavior. Provider accounts
and organization content must be configured in the new instance.

Optional initial-admin invite:

```sh
docker compose --env-file .env -f template/compose.yaml exec app \
  node cli/dist/index.js auth bootstrap-ceo
```

Verify and stop:

```sh
curl --fail http://localhost:3100/api/health
docker compose --env-file .env -f template/compose.yaml down
```

The stop command retains volumes. Back up your new instance before upgrades.
Keep `.env` outside Git. Do not reuse secrets, databases, or provider logins from
another installation. `configure.py` refuses to overwrite an existing `.env`.

## Source development

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Development and production deployment have different database/auth defaults;
follow `doc/DEVELOPING.md` and `doc/DATABASE.md` for source development.

## Optional native host capabilities

The Python Admin worker, root executor, Backblaze allocation, source-history
workers, native runtime tools, reverse proxy and daily storage cleanup are optional
host integrations. Their first-party scripts are in `host-reference/`, with setup
boundaries described there. They need host-specific configuration and authorized
third-party runtimes. The Compose recipe does not configure these host services or
copy an existing host's private configuration.

## Export validation

```sh
python3 template/validate.py
python3 template/validate.py --secrets
```

The second command requires `gitleaks` on PATH. Reviewed scanner false positives
are pinned to exact file/line-content hashes in `secret-fixtures.json`; changes
must be reviewed rather than automatically accepted. The GitHub template checks
repeat the scan. The original release and publishing workflows are intentionally
not activated by this template's CI.
