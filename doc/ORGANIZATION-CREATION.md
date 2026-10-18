# Organization creation

For a deployment with a single authorized organization creator, set
`WHOXOS_ORGANIZATION_CREATOR_USER_ID` to that account's immutable user ID.
Only that authenticated board account can create organizations, including via
imports. Other instance admins, organization owners, members and agents cannot
use a role, email change, or imported organization to bypass this restriction.
Without this operator setting, the existing self-hosted instance-admin policy
applies. Cloud-managed creation continues to be managed by Cloud.

`GET /api/cli-auth/me` reports `canCreateOrganizations` for the current actor.
The organization switcher hides creation while permission is unknown or denied.

“Create organization” explicitly requests a fresh onboarding instance. It does
not restore a prior organization's draft, identifiers, agent or model setup.
Resuming an existing organization's onboarding remains a separate action.

The WHOXOS deployment pins creation to the existing account
`admin@overviewlabs.ai` using its user ID, rather than the changeable email.

## Private source repositories on this VPS

`overview-organization-repositories.service` provisions one private source
repository under `Overview-Labs` for each active organization owned by the
configured instance owner. Existing GitHub project links are preserved; TQL
WHOX MS uses `Overview-Labs/WHOX-MS` after its repository transfer. New repositories use readable names,
with an immutable organization ID suffix only when needed to avoid a collision.
Retries only adopt private repositories marked for that exact organization.

The service listens for content-free PostgreSQL notifications from company
and owner-membership mutations. It reconciles at startup and reconnect, runs
one setup job at a time, and performs no idle polling. Failed jobs have at most
five bounded retries. Root-only status is recorded in
`/var/lib/overview-organization-repositories/status.json`; restarting the
service retries outstanding organizations. Database triggers and the worker's
independent active-owner/instance-admin checks prevent notifications from
granting repository creation authority.

New repositories start with a README and `.gitignore`, and are registered as
the primary workspace of an organization source project. New local working
copies live below `/.WHOX/organizations/<name>-<id>/projects/source`; explicit
existing roots remain in place. Credentials stay in root's existing GitHub
credential store. Provisioning does not copy those credentials into agent
environments or create agent connection grants. Agents use their existing
authorized GitHub connections, or the organization's authorized host executor.

Repository creation does not push existing application folders, credentials,
databases, uploads or runtime data. Source commits and pushes remain explicit
Git operations. Organization archival/deletion does not delete GitHub history.
Backblaze file allocation and backups retain their separate responsibilities.

Deployment files and focused regression tests are in
`scripts/organization-repositories/`. The operator configuration is
`/etc/overview-labs/organization-repositories.json`. This VPS integration uses
the existing company/project/workspace schema and does not add a second
repository catalog.
