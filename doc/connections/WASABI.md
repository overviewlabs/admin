# Current qualification status — 2026-10-04 12:36 UTC

Wasabi MCP is connected; Treasury's private bucket and encrypted synthetic worker
transfer path are installed. Independent TASK-131 review reproduced the v2 worker
checks, code/build hashes, cross-process writer fencing and killed-writer handling.
It REJECTED v2 qualification because the separate server diagnostic probe could
report cleanup after a timed-out PUT that later completed. A completed review task
is not acceptance.

The v3 probe correction persists a metadata-only intent before dispatch and holds
unknown outcomes without claiming cleanup. Its deterministic delayed-completion
and failed-journal regressions pass:23 focused TypeScript tests and server typecheck.
v3 is deployed after normal task drain, which is now cleared. Fresh live probe
d17af566-0c4b-4bf2-9c26-91a1480a1e0b passes and its durable journal records
put_pending, put_completed, cleanup_verified. Exact artifact:
/api/attachments/54b285c8-3f74-48fa-9a04-913a4bf7eea5/content. Independent
Technology review explicitly ACCEPTED synthetic v3 at12:35:06UTC on TASK-131,
document technology-qualification-review-v3. It reproduced26 TypeScript checks,
22 Wasabi Python and17 service tests; actual durable journal and installed/build
hashes match. This clears the v2 probe defect only, not licensed admission or
whole-host power-loss recovery. Independent regressions:
/api/attachments/63414e51-d6b3-45a0-8b10-58b1f9b29423/content.

Full historical downloads remain held until the canonical active Data/task route,
frozen query/stream manifest and durable private sink are wired and independently
accepted. Current storage qualification is synthetic only; no licensed download
was started. Existing Databento key/funding and Wasabi OAuth remain available.
Oracle backup is explicitly skipped. Replication inspection remains unverified.

Older sections below are historical context, not fresh sign-in requirements.

---

# Current setup: Wasabi MCP

The owner switched back to MCP. The existing Wasabi S3 connection
`eb8abeaa-f7a2-416c-bd3c-0f2d87aff23d` is enabled as a draft awaiting sign-in;
no duplicate connection was created and no revoked grant was manually reactivated.
Open /TRE/apps/eb8abeaa-f7a2-416c-bd3c-0f2d87aff23d/permissions and choose Connect.
The official endpoint is https://mcp.wasabisys.dev/s3. The existing localhost
PKCE flow remains in use: sign in in the provider tab, then paste the complete
localhost callback URL into the WHOXOS dialog in the originating session.
Never paste callback URLs into chat. Credentials belong on the provider page.

The direct S3 adapter below remains inactive supporting code. Its separate vault
key request is superseded by MCP setup; do not require the user to configure both.
MCP authorization and live object tests are still required before claiming storage
ready. Licensed payload bytes still transfer privately worker-to-S3; they do not
belong in MCP/model transcripts. Oracle backup remains skipped.

---

## Previous direct-API implementation (inactive)

# Wasabi S3 API for Treasury

Owner direction on 2026-10-04: use the direct API instead of MCP. The unfinished
OAuth/MCP connection `eb8abeaa-f7a2-416c-bd3c-0f2d87aff23d` was archived through the
normal connection API after verifying it was still unsigned. No account tokens
were present. OAuth, localhost callbacks, and MCP discovery are no longer part
of this storage setup.

## Credentials and configuration

Save the Wasabi access-key ID and secret access key in Treasury Settings → Secrets:

- `integrations/wasabi/access-key-id`
- `integrations/wasabi/secret-access-key`

Provide the bucket name and its actual region separately. Never paste credentials
into chats or issue comments. Wasabi API credentials were not found during setup;
the existing Databento credential is separate and remains in place.

The private worker transport is installed at
`/usr/local/libexec/treasury-research/wasabi_storage.py`, from
`scripts/treasury-research/wasabi_storage.py`. It uses boto3, HTTPS, explicit
credentials, and SigV4 against the official regional S3 endpoint. It cannot fall
back to ambient AWS credentials or use an arbitrary endpoint/company prefix.

The operator must provision these root-owned mode-0600 files through the existing
secret-resolution path (never through agent transcripts). No empty files or fake
keys have been provisioned:

`/etc/treasury-research/wasabi-credentials.json`:

```json
{"accessKeyId":"<resolved from vault>","secretAccessKey":"<resolved from vault>"}
```

`/etc/treasury-research/wasabi.json`:

```json
{
  "bucket": "<authorized private research bucket>",
  "region": "<actual Wasabi bucket region>",
  "prefix": "treasury/0d8aad87-64f2-4f9c-a92c-94a261e140f7/research"
}
```

Use a bucket-scoped principal. Required data operations are PutObject,
GetObject/GetObjectVersion, DeleteObject/DeleteObjectVersion, ListBucket,
and ListBucketVersions on the research prefix (HeadBucket uses ListBucket).
The adapter creates no buckets, public policies, replication or retention locks.
No IAM or account-management permission is needed for this transport.

## Transfer and qualification

The worker-facing transport accepts bounded encrypted chunks (maximum 8 MiB),
requests server-side AES256 encryption, and returns only receipts with key,
version ID, byte count and SHA256. Verification streams bytes privately and
checks the actual content hash. Deletion names a version where supplied and
requires confirmed absence; 403 is never interpreted as absence. Automatic SDK
retries are disabled so the calling durable manifest controller can reconcile
unknown outcomes rather than duplicate versioned writes.

Run the operator-only synthetic check after provisioning:

```sh
python3 /usr/local/libexec/treasury-research/wasabi_storage.py --probe
```

It uploads 4 KiB random synthetic bytes to a unique test key, verifies a full
read, reconciles/deletes all versions of that exact test key, and verifies absence.
Failed uploads and checksum failures also attempt cleanup. It returns no payload,
credentials or signed URLs. Provider failures return a fixed error code.

This is an installed transport, not an enabled full-history acquisition pipeline.
No production worker service or firewall was changed. Final integration still
needs the durable manifest/purpose-end controller, bounded processing cache,
credential provisioning, actual bucket/privacy/retention checks, and live tests.
Licensed bytes must go worker-to-S3 and never through MCP or model context.
The existing pilot, cache, ledger, receipts and Databento key remain intact.
Oracle backup verification remains skipped by the owner.

## Validation

12 tests pass, including actual boto3 request-schema validation using Stubber,
explicit credential/endpoint handling, prefix escape rejection, chunk bounds,
content corruption, version-specific deletion, denied access, and cleanup after
lost PUT responses. The installed command correctly reports configuration_required
without credentials. No live Wasabi write/read/delete or bucket readiness is claimed.

References:
- https://docs.wasabi.com/apidocs/generating-an-s3-api-key
- https://docs.wasabi.com/docs/service-urls-for-wasabis-storage-regions
- https://docs.wasabi.com/apidocs/wasabi-api

## Tab-return recovery fix

The user's callback was a structurally correct localhost callback. The frontend
compared its state only to the newest in-memory authorization URL, rejecting
still-valid earlier attempts before the authenticated server could validate them.
The pending dialog was not recoverable across a tab reload. Manual OAuth states
had a ten-minute expiry.

Deployed changes:
- Pending authorization link and server expiry persist in tab-local sessionStorage;
  callback codes, PKCE verifiers and tokens are never persisted there.
- Client validates callback structure. Server remains authoritative for connection,
  actor/subject, expiry, client binding, PKCE and single-use state consumption.
- New manual loopback sign-ins expire after thirty minutes; hosted sign-ins retain
  ten minutes. Existing expired/consumed states are not revived.
- Explicit cancel/success clears pending data; restart creates a new sign-in.
- Invalid provider-page URLs and incomplete callback URLs have distinct guidance.

Validation: 172 targeted tests pass; UI TypeScript, production build and token gates
pass. A live authenticated browser opened the provider tab, returned, reloaded,
and restored the identical authorization link without another OAuth start. Live
start reported thirty minutes. An earlier synthetic callback reached the server
route after explicit restart (request intercepted in browser test; no real token
exchange or account authorization). The official Wasabi sign-in page still loads.
Task drain cleared; services healthy. User sign-in and storage tests remain pending.

Rollback: /var/backups/overview-labs/wasabi-tab-fix-20261004T112707Z


# Wasabi MCP connected — live checks, 2026-10-04

This supersedes earlier pending-authorization reports. The owner completed sign-in.

- Treasury connection `eb8abeaa-f7a2-416c-bd3c-0f2d87aff23d` is active and healthy; 53 actual provider tools are discovered. Board test-as-agent access reports all 53 allowed for both Head of IT and Data.
- Authenticated list-buckets succeeded. The account initially returned no buckets.
- Created `whox-treasury-research-0d8aad87` in `us-east-1`, explicitly private, Object Lock disabled. Private ACL verified: owner only, no public/group grants. Versioning has never been enabled. Bucket policy, lifecycle and Object Lock configuration are absent.
- Replication configuration inspection returned AccessDenied (403). No replication was configured by this work; absence of replication is not independently certified.

## Transfer test limitation — not a provider upload defect

Real tools `wasabi_s3_presign_put_object` and `wasabi_s3_presign_get_object` return `{url, expiresIn}` and accept lowercase bucket/key, region, expiresIn; PUT optionally accepts contentType. Other S3 tools use uppercase Bucket/Key.

The normal board test-call route redacts tool results through `validateToolContent` in `runTestToolInvocation`. Returned signed URLs contain a redacted X-Amz-Credential and no usable signature. A synthetic PUT using that redacted output failed HTTP400 AuthorizationHeaderMalformed (missing access key). This does NOT establish that Wasabi generated an invalid URL. Do not retry these redacted URLs, weaken global redaction, or request reconnection.

No synthetic object upload succeeded. Cleanup DELETE returned204 and scoped version listing confirmed no versions/delete markers for each attempted unique key. This is cleanup evidence, NOT a successful upload/read/delete round trip. No licensed data was acquired or uploaded.

## Remaining implementation

The private storage worker needs an authenticated, company-scoped server-side broker that consumes the original signed URLs in memory before agent-result redaction, enforcing the existing connected-tool policy and audit boundary. Transfer ciphertext directly worker-to-S3 with fixed approved hosts, bucket/prefix and bounded sizes. Keep OAuth tokens, signed URLs and licensed payloads out of model outputs, artifacts and logs. Do not claim a private transfer implementation is already active.

After integration, verify actual write/read hash/deletion, restart/checkpoint recovery and purpose-end behavior under the existing storage contract; Technology acceptance remains outstanding. Keep TASK-118 and TASK-102 honest about these remaining conditions. No further owner OAuth action or repeat spending approval is needed. Oracle backup remains explicitly skipped.
