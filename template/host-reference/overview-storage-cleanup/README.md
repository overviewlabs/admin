# Daily storage cleanup

`overview-storage-cleanup.timer` runs daily at **04:00 America/New_York**.
Systemd adjusts for daylight saving time and runs a missed cleanup after boot.
The first manual cleanup began on 2026-10-15.

## Retention

- Release snapshots: archive finalized releases older than 24 hours to the existing
  private Backblaze `backups` namespace. Keep the two latest successful releases
  per workspace, the current release, all prepared releases, and snapshots referenced
  by retained releases, container mounts (including stopped containers), or open files.
- Package the complete snapshot, including private configuration and database dumps,
  compress and encrypt using the existing file-store recovery key. Verify remote
  checksums, download and decrypt the archive, and checkpoint the remote index before
  removing local payloads. Retain `record.json` and `cold.json` locally.
- The existing verified-file cache service removes redundant local object copies and
  verified SQL backup files older than 24 hours. Its hourly timer remains enabled.
- Remove unused Docker build cache older than 24 hours; isolated builders reserve
  2 GB each. Keep tagged release images and every Docker volume/container.
- Remove dangling images older than seven days, downloaded package archives, and
  archived journal logs exceeding 512 MB or fourteen days.
- Do not prune source workspaces, session history, application databases or uploads
  that lack the existing verified remote-storage allocation.

## Operation and recovery

Run now: `systemctl start overview-storage-cleanup.service`

Schedule: `systemctl list-timers overview-storage-cleanup.timer`

Report: `/var/lib/overview-storage-cleanup/last-run.json`

Logs: `journalctl -u overview-storage-cleanup.service`

Preview eligible snapshots:
`/usr/local/libexec/overview-storage-cleanup/cold.py plan`

Test a full download, decrypt and extraction without changing the local release:
`/usr/local/libexec/overview-storage-cleanup/cold.py verify RELEASE_DIRECTORY`

Restore a cold snapshot:
`/usr/local/libexec/overview-storage-cleanup/cold.py restore RELEASE_DIRECTORY`

The existing `releases.recovery()` entrypoint automatically restores cold source
before rollback. Restoring source does not deploy code or restore application databases.
Private database restore remains an explicit operator action.

On an upload or verification failure, the source payload is retained. Independent
cleanup steps continue and the service reports failure for inspection. Run status
records step results and disk usage before/after. Scratch archives live on the WHOX
volume and are removed when each operation exits normally.

Related backup reliability changes: maintenance staging uses
`/.WHOX/.System/overview-file-store-scratch` rather than the system disk; new SQL
gzip files must be at least ten minutes old before upload. Catalog JSON is compact
and bounded at 64 MiB so the existing 25 MiB source catalog can publish successfully.
