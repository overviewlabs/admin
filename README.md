# Overview Labs installation template

A clean source snapshot of the customized Overview Labs / WHOXOS installation,
prepared for a fresh deployment. Use GitHub's **Use this template** button to
create your own repository, then follow [the installation guide](template/README.md).

```sh
python3 template/configure.py
docker compose --env-file .env -f template/compose.yaml up --build -d
```

Open `http://localhost:3100` and claim the first administrator locally. The setup
uses authenticated application access, persistent PostgreSQL/application volumes,
loopback-only HTTP, and newly generated per-install secrets.

Included: customized web UI and control-plane source, database migrations, agent
adapters, source tests, vendored public assets and licenses, the upstream Docker
build, a fresh Compose setup, and reference source for optional native host services.

This is a reusable application template, not a copy of an operating server's state.
Existing companies, users, tasks, uploads, databases, backup archives, provider
sessions, private keys, Git history, dependency installations and machine credentials
are excluded. Native Admin and host-only capabilities require their separately
installed runtimes and configuration; see [host integrations](template/host-reference/README.md).

Source provenance is recorded in [TEMPLATE-SOURCE.json](TEMPLATE-SOURCE.json).
The customized application descends from [Paperclip](https://github.com/paperclipai/paperclip);
its MIT license and bundled third-party notices are retained. Application and
upstream contributor documentation remain in [README.application.md](README.application.md)
and `doc/`. This template does not push changes into the upstream repository.

See [template validation](template/README.md#export-validation) for export checks.
A source snapshot's validation does not certify every application feature or every
optional host integration on a new machine; run the full workspace checks and your
own deployment smoke tests before putting a new instance into use.
