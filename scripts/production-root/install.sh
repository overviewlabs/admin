#!/bin/bash
set -euo pipefail
if [[ $(id -u) != 0 || $# != 1 || ! "$1" =~ ^[0-9]+$ ]]; then
  echo 'Usage (as root): install.sh <trusted production API PID>' >&2
  exit 1
fi
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
install -d -o root -g root -m 0755 /usr/local/libexec/overview-root-executor
install -o root -g root -m 0755 "$source_dir/executor.py" "$source_dir/bind.py" /usr/local/libexec/overview-root-executor/
install -o root -g root -m 0644 "$source_dir/overview-root-executor.service" /etc/systemd/system/overview-root-executor.service
/usr/bin/python3 /usr/local/libexec/overview-root-executor/bind.py --pid "$1"
systemctl daemon-reload
systemctl enable --now overview-root-executor.service
