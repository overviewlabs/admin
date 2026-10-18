#!/usr/bin/env bash
# Run as root. This installs only the private search service, never the app.
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run this installer as root.' >&2; exit 1; }
recipe_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install_root=/opt/overview-labs/searxng
source_dir="$install_root/src"
venv_dir="$install_root/venv"
revision="$(cat "$recipe_dir/revision")"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid pinned revision.' >&2; exit 1; }
missing_packages=()
for package in python3-venv git ca-certificates; do
  if [ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true)" != 'install ok installed' ]; then
    missing_packages+=("$package")
  fi
done
if [ "${#missing_packages[@]}" -gt 0 ]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y "${missing_packages[@]}"
fi
if ! getent passwd searxng >/dev/null; then
  useradd --system --home-dir /var/lib/overview-labs-searxng --shell /usr/sbin/nologin searxng
fi
install -d -m 0755 "$install_root"
install -d -o root -g searxng -m 0750 /etc/overview-labs-searxng
install -d -o searxng -g searxng -m 0750 /var/lib/overview-labs-searxng
if [ ! -d "$source_dir/.git" ]; then
  git clone --no-checkout https://github.com/searxng/searxng.git "$source_dir"
fi
test "$(git -C "$source_dir" remote get-url origin)" = https://github.com/searxng/searxng.git
git -C "$source_dir" diff --quiet
if ! git -C "$source_dir" cat-file -e "$revision^{commit}" 2>/dev/null; then
  git -C "$source_dir" fetch --depth 1 origin "$revision"
fi
git -C "$source_dir" checkout --detach "$revision"
python3 -m venv "$venv_dir"
"$venv_dir/bin/python" -m pip install -r "$recipe_dir/requirements.lock"
(
  cd "$source_dir"
  # Official release metadata avoids invoking git as the unprivileged worker.
  "$venv_dir/bin/python" -m searx.version freeze
  "$venv_dir/bin/python" -m pip install --no-build-isolation --no-deps -e .
)
install -o root -g root -m 0644 "$recipe_dir/overview_searxng.py" "$install_root/overview_searxng.py"
# Reviewed local extension; upstream tracked source stays at the pinned commit.
install -o root -g root -m 0644 "$recipe_dir/overview_google_news_rss.py" "$source_dir/searx/engines/overview_google_news_rss.py"
install -o root -g searxng -m 0640 "$recipe_dir/limiter.toml" /etc/overview-labs-searxng/limiter.toml
# Preserve the existing generated key across idempotent reconfiguration.
"$venv_dir/bin/python" - "$recipe_dir/settings.yml.template" <<'PY'
import os, pathlib, secrets, sys, yaml
path = pathlib.Path('/etc/overview-labs-searxng/settings.yml')
existing = yaml.safe_load(path.read_text()) if path.exists() else {}
secret = (existing or {}).get('server', {}).get('secret_key') or secrets.token_hex(32)
template = pathlib.Path(sys.argv[1]).read_text()
settings = yaml.safe_load(template)
settings['server']['secret_key'] = secret
temporary = path.with_suffix('.new')
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as stream:
    yaml.safe_dump(settings, stream, sort_keys=False)
os.replace(temporary, path)
PY
chown root:searxng /etc/overview-labs-searxng/settings.yml
chmod 0640 /etc/overview-labs-searxng/settings.yml
install -o root -g root -m 0644 "$recipe_dir/overview-labs-searxng.service" /etc/systemd/system/overview-labs-searxng.service
systemctl daemon-reload
systemctl enable overview-labs-searxng.service
systemctl restart overview-labs-searxng.service
python3 - <<'PY'
import time, urllib.request
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8888/healthz', timeout=2) as response:
            if response.status == 200 and response.read() == b'OK':
                print('SearXNG ready on 127.0.0.1:8888 (healthz OK).')
                break
    except (OSError, TimeoutError):
        pass
    time.sleep(1)
else:
    raise SystemExit('SearXNG did not become healthy; inspect systemctl status overview-labs-searxng.')
PY
