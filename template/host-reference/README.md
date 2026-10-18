# Optional host integrations

These scripts accompany the customized control plane on the source installation.
They are reference source, not automatically enabled services. Review and configure
paths, domains, instance identity, workspace mappings, PostgreSQL access and private
Backblaze settings for your own host before enabling them. Company-specific helpers
are retained as reference code; they do not contain the corresponding company data.

The core Compose deployment works without these scripts. Native Admin requires an
authorized cptr distribution (the source host used version 0.9.21), its separately
installed Python environment, an isolated state directory, and the root-executor
bridge. Installed third-party runtimes and vendor tools are dependencies, not bundled
application source. This template does not copy their installed environments.

File storage and version-control workers expect their own private configuration and
application databases. No credentials, organization registry, recovery key, socket,
user database, or existing systemd environment file is included. The storage cleanup
reference uses 04:00 America/New_York; it must be configured for the volumes and
services on its destination host before enabling it.

The `systemd/overview-storage-cleanup.*` examples preserve the daily 4:00 a.m.
Eastern schedule (including daylight saving changes). Copy them into systemd only
after installing the referenced helpers and configuring destination-host storage;
the template does not enable them automatically.
