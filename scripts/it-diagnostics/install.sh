#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo 'Install requires the server administrator.' >&2
  exit 1
fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
/usr/bin/python3 -m unittest discover -s "$SCRIPT_DIR" -p 'test_*.py'
install -d -o root -g root -m 0755 /usr/local/libexec /var/lib/overview-labs-health
install -o root -g root -m 0755 "$SCRIPT_DIR/collector.py" /usr/local/libexec/overview-labs-it-diagnostics.py
install -o root -g root -m 0755 "$SCRIPT_DIR/backfill.py" /usr/local/libexec/overview-labs-it-diagnostics-backfill.py
install -o root -g root -m 0644 "$SCRIPT_DIR/overview-labs-it-diagnostics.service" /etc/systemd/system/overview-labs-it-diagnostics.service
install -o root -g root -m 0644 "$SCRIPT_DIR/overview-labs-it-diagnostics.timer" /etc/systemd/system/overview-labs-it-diagnostics.timer
systemd-analyze verify /etc/systemd/system/overview-labs-it-diagnostics.service /etc/systemd/system/overview-labs-it-diagnostics.timer
systemctl daemon-reload
systemctl enable --now overview-labs-it-diagnostics.timer
systemctl start overview-labs-it-diagnostics.service
/usr/bin/python3 -I -c 'import json; p=json.load(open("/var/lib/overview-labs-health/it-diagnostics.json")); print(json.dumps({"generatedAt":p["generatedAt"],"sources":[{"id":s["id"],"available":s["available"],"events":len(s["events"]),"truncated":s["truncated"]} for s in p["sources"]]}))'
