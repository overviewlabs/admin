# Production root command executor

This is **root on the actual production host**, not root inside a sandbox. An
agent with a grant can modify every hosted organization's underlying files and
services. It uses a distinct command tool; the model runtime and web server
remain unprivileged. It does not add `sudo ALL` to the shared application user.

All organizations are eligible. CEOs and ordinary top-level managers automatically receive host grants and delegation authority when their organization's responsible owner is an active server administrator and organization owner/admin. Other agents need an explicit human or leadership grant. Built-in services and security provisioning are excluded from automatic leadership grants. Company termination revokes agent grants before removing their data.

A human managing grants must be both a server administrator and an active organization owner/admin. CEOs and top-level managers can grant or revoke access for agents within their organization using their current run credentials. The broker independently checks the manager's root-owned leadership grant. Each execution checks exact agent/company identity, active membership, standard credentials, the running execution and its responsible human's current server and organization roles.

Grants are authoritative in root-owned SQLite, not the legacy
`permissions.unrestrictedSystemAccess` JSON field (which remains fail-closed).
The permission UI uses the new `/production-root` capability endpoint. The
broker checks the API process's kernel PID, UID and process start time. There
is no broker bearer secret to inherit into agent processes. This is a command
broker, **not OS isolation of the existing local agent runtimes**. It trusts the
control plane, its authentication and its data store; it is not a boundary
against compromise of that application. Host root itself cannot be constrained
to one organization and an already privileged command can change host policy.

## Install and maintenance

As the host operator, verify the actual API process and run:

```sh
sudo scripts/production-root/install.sh <production-api-pid>
```

On startup, the control plane provisions leadership grants automatically. Leaders may PATCH another agent's **Production root access** within their organization. Human server administrators can also use the Permissions switch. Disabling requests cancellation of its
running commands and blocks new ones. Completed changes are not rolled back.

**After an API restart**, the old PID binding is intentionally invalid. As root:

```sh
sudo python3 /usr/local/libexec/overview-root-executor/bind.py --pid <new-api-pid>
```

A root operator must validate that PID, rather than automatically trusting a
process from the shared application UID. Rebinding to the same UID/GID does not
require a broker restart. The UI reports the executor unavailable until bound.
On a broker restart, accepted receipts remain recorded; unfinished command
outcomes must be investigated and never automatically replayed. Inspect
`overview-root-command-<requestId>.service` for a command still running.

## Agent API

Using the current run's normal bearer credential:

- `GET /api/companies/:companyId/agents/:agentId/production-root`
- `PATCH /api/companies/:companyId/agents/:agentId/production-root` with `{ "enabled": true }` or `{ "enabled": false }`
- `POST /api/companies/:companyId/agents/:agentId/production-root/commands`

```json
{"requestId":"<new UUID>","command":"id -u","timeoutMs":30000}
```

The response includes exitCode, output, timedOut, revoked and truncated. A retry
must retain the same request ID and exact arguments; receipts prevent duplicate
execution even after a lost response. If the result is unavailable, investigate
the prior outcome before issuing a new request ID. Never retry root mutations
blindly. Agent instructions should discover the grant first and use this API,
rather than invoking sudo locally.

Voice uses `voice_workspace` with `target: "production"`. The default remains
`workspace`. Both use the same root broker and grant enforcement. The model
provider does not change. Tools must not infer success from narration.

Root-only audit metadata: `/var/lib/overview-root-executor/audit.jsonl`.
Application audit events record grant changes, request ID, command hash and
outcome. Command text and output are deliberately not logged because they can
contain sensitive data. Execution receipts are persistent; response output is
bounded and cached only in memory. Concurrent work is limited to one root
command per agent and four across the server. Commands have a maximum duration
of five minutes; background services should be installed as explicit host
services, not abandoned shell children.

## Historical Treasury IT activation repair — 2026-10-03

The October 10 leadership policy supersedes this earlier fixed eligibility list.

TASK-108 was waiting on interaction `0893f1f2-760b-4691-9954-75200d88ba5b`
although the owner had already selected the controlled IT executor route. Both
eligibility checks still allowed only the main organization. The fixed policy
adds the exact Treasury/Head-of-IT pair at both layers and keeps explicit grants,
current-run credentials, responsible-human membership and peer binding intact.
The agent exception also participates in company-termination grant cleanup.

Validation: server TypeScript check and compilation passed; 36 API/service tests
and 11 broker/protocol tests passed, including root execution, revocation,
foreign agent denial and same-UID peer rejection. The live API returned eligible,
available and enabled for Head of IT after the audited grant, while Treasury's
CEO remained ineligible. Resolving the existing interaction resumed run
`457aab2f-35bb-4cbb-af55-a6bde8038144`; its first two broker commands completed
with exit code 0. Activation alone does not establish storage isolation or clear
the acquisition/independent-verification requirements.
