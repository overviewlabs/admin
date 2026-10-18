"""Exact Git trust for root-managed, owner-verified organization repositories."""
import json, os, tempfile
from pathlib import Path
TRUST_FILE = Path('/var/lib/overview-git-trust/organizations.conf')
def reconcile_git_trust(entries, target=TRUST_FILE):
    paths = set()
    for entry in entries:
        repo = Path(entry['repo'])
        if not str(repo).startswith('/.WHOX/organizations/') or repo.resolve() != repo or not (repo / '.git').exists():
            raise ValueError('Git trust requires a canonical registered organization checkout')
        paths.add(str(repo))
    # Git's quoted syntax protects spaces, quotes, and control characters.
    content = '[safe]\n' + ''.join('\tdirectory = ' + json.dumps(repo, ensure_ascii=False) + '\n' for repo in sorted(paths))
    if target.exists() and target.read_text() == content:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.organization-git-trust-', dir=target.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(content)
        os.chmod(temp, 0o644)
        os.replace(temp, target)
    finally:
        Path(temp).unlink(missing_ok=True)
    return True
