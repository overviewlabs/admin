# IT service diagnostics

This root-owned, fixed-source collector gives the authorized IT department a bounded service-health view without exposing raw server logs or giving the shared application process root access. The application reads `/var/lib/overview-labs-health/it-diagnostics.json` through its authenticated, company-scoped diagnostics endpoint. Authorization and per-read audit remain the application's responsibility.

The collector exports only timestamps, source availability, severity, fixed error codes, fixed service names, and counts. It never exports raw messages, paths, requests, SQL, transcripts, credentials, or arbitrary source fields. It reads a fixed 30-minute window from the WHOXOS user journal, the health/SearXNG/Caddy system journals, and PostgreSQL's fixed log path. Journal output is limited to 2,000 rows and 2 MiB per command; the PostgreSQL tail is limited to 1 MiB; each source returns at most 100 events. Truncation is explicit. The collector also archives immutable overlapping two-minute scans once per minute; successful, nontruncated scans establish only that a bounded query ran. They do not establish that journals or PostgreSQL files retained all earlier records. This remains a bounded warning/error metadata archive, not a raw incident log or a complete service lifecycle record.

`available` means the fixed source could be read, not that the service is healthy. An empty event list means no matching warning/error entries were found in the bounded scan. It does not prove that no failure occurred. Historical responses distinguish scan coverage from retained-source completeness, and identify failed scans, capped scans, missing intervals, invalid snapshots, inventory bounds and capped output. The collector does not independently verify journal or PostgreSQL retention. Every source therefore carries `retentionVerified: false`, including successful empty scans and newly rotated files. Failed collection retains explicit source status; clients should reject reports older than five minutes.

## Install or update

Run as the server administrator from the repository root:

```sh
scripts/it-diagnostics/install.sh
```

The idempotent installer first runs the Python tests, installs the root-owned collector and systemd units, validates the units, enables the timer, and performs one collection. It does not restart the app or modify Caddy, sudoers, raw-log permissions, or the existing health collector.

The service runs once per minute with a 20-second deadline, 96 MiB memory limit, a read-only system filesystem, a private network namespace, and writes limited to the health-cache directory. It accepts no arguments and runs no user-supplied commands. `whoxos` currently has UID 1001; deployments using another UID must adjust that fixed journal selector before installation.

```sh
systemctl status overview-labs-it-diagnostics.timer --no-pager
systemctl start overview-labs-it-diagnostics.service
python3 -m unittest discover -s scripts/it-diagnostics -p 'test_*.py'
```

Installed files:

- `/usr/local/libexec/overview-labs-it-diagnostics.py`
- `/etc/systemd/system/overview-labs-it-diagnostics.service`
- `/etc/systemd/system/overview-labs-it-diagnostics.timer`
- `/var/lib/overview-labs-health/it-diagnostics.json`
- `/var/lib/overview-labs-health/it-diagnostics-history/` (root-owned immutable metadata, rolling 24-hour retention)
- `/usr/local/libexec/overview-labs-it-diagnostics-backfill.py` (root operator only)

The root-owned cache is readable by the application and contains only non-sensitive metadata. Processes sharing the application's Unix identity can also read it directly; API authorization cannot provide Unix-process isolation between those processes. Raw journal and PostgreSQL access remain restricted.

## Historical incidents

Use [AGENT-INSTRUCTIONS.md](AGENT-INSTRUCTIONS.md) for the scoped IT agent instruction bundle when installing this capability. It describes both default and historical reads without granting host privileges.

The same authenticated endpoint accepts exactly `since` and `until` as timezone-qualified ISO timestamps. The interval must be positive, at most two hours, end at or before now, and start within the last 24 hours. All ordinary organization/agent/run/scope checks and read auditing apply; authorization is rechecked after reading the archive. The HTTP process never invokes the collector, journalctl or sudo.

Example: `GET /api/companies/:companyId/it-diagnostics?since=2026-09-28T03:56:30Z&until=2026-09-28T03:58:00Z` (only while within retention).

Historical output has `mode: "history"`. Each source reports `scanCoverage.complete`, `scanCoverage.gaps`, `failedSnapshots`, `incompleteSnapshots` and `eventsTruncated`. `inventoryTruncated` or capped event output prevents a complete-scan claim. `coverage.complete` and `coverage.retentionVerified` remain false because source retention/continuity is not proved. Successful empty scans are unknown evidence, never a clean bill of health; nonempty scans likewise cannot prove that no intervening files were rotated or removed. Legacy snapshots without explicit provenance remain usable evidence but do not establish precise scan coverage. Overlapping identical timestamp/severity/code/unit records are deduplicated using the largest count seen in one snapshot; this does not supply raw-message identity. Failed or capped snapshots can contribute evidence but cannot establish complete scan coverage. Missing history is never silently replaced by current health data. Event timestamps are log timestamps, not inferred incident onset or resolution.

For a recent incident predating installation, the server administrator can explicitly backfill metadata from the same fixed sources. This utility accepts only the bounded timestamps; it cannot select files, units, commands, fields, credentials or a destination. It scans two-minute chunks, retains every source's actual truncation/unavailability, does not overwrite existing snapshots, and does not restart services. It is not callable through the API and adds no sudo grant to the shared application user.

```sh
/usr/bin/python3 -I /usr/local/libexec/overview-labs-it-diagnostics-backfill.py 2026-09-28T03:56:30Z 2026-09-28T03:58:00Z
```

Backfill cannot reconstruct journal rotation, older PostgreSQL content outside the bounded tail, or other missing data. Review returned coverage rather than claiming that a successful collector exit means complete evidence. Retention cleanup removes expired snapshots; archive publications within retention are append-only and never replaced. No raw message text is exported.

## Roll back

```sh
systemctl disable --now overview-labs-it-diagnostics.timer
systemctl stop overview-labs-it-diagnostics.service
rm /etc/systemd/system/overview-labs-it-diagnostics.timer /etc/systemd/system/overview-labs-it-diagnostics.service
rm /usr/local/libexec/overview-labs-it-diagnostics.py /usr/local/libexec/overview-labs-it-diagnostics-backfill.py /var/lib/overview-labs-health/it-diagnostics.json
rm -r /var/lib/overview-labs-health/it-diagnostics-history
systemctl daemon-reload
```

Keep the existing health directory and health-check service: they are shared with the pre-existing health monitor. After removal, the API should report diagnostics unavailable instead of returning stale evidence.

## ACP runner DNS/network regression

The separately installed Codex ACP 1.13.1 runtime initially ignored `WHOXOS_CODEX_ACP_NETWORK_ACCESS=true`: its workspace preset reset `networkAccess` to false at every Codex turn. Host DNS continued to work as the application user. The repository's pnpm patch covered version 1.6.2, so it did not protect the separately upgraded runtime.

The repeatable repair below supports exactly the reviewed versions 1.6.2 and 1.13.1 and fails if the upstream turn boundary changes. It preserves filesystem confinement, approval policy/reviewer, model selection, explicit operator network denial, and execution-target network denial. It writes an original-file backup and preserves ownership/mode. Run the check after any runtime package installation or upgrade; an unreviewed version requires a reviewed patch before rollout.

```sh
node --test scripts/patch-codex-acp-network.test.mjs
node scripts/patch-codex-acp-network.mjs --check /var/lib/whoxos/.whoxos/cli/current/node_modules/@agentclientprotocol/codex-acp
node scripts/patch-codex-acp-network.mjs --apply /var/lib/whoxos/.whoxos/cli/current/node_modules/@agentclientprotocol/codex-acp
CODEX_ACP_TEST_ENTRY=/var/lib/whoxos/.whoxos/cli/current/node_modules/@agentclientprotocol/codex-acp/dist/index.js node --test scripts/codex-acp-network-policy.test.mjs
```

The test extracts the installed turn method and supplies an in-memory transport stub. It verifies the actual sandbox-policy arguments without model calls or organization mutations. Existing warm ACP processes must be recycled by the normal controlled application deployment before they adopt a changed dependency; do not interrupt unrelated active work just to reload it. A real subsequent authorized IT run should verify its API access before the task is closed.
