# Organization invitation email

Updated 2026-09-26.

Members → Invites accepts one optional recipient email. With an address, creating
an invitation sends its single-use link using the selected membership role. With
no address, the existing copy-link flow remains available. The server retains
`users:invite` authorization, validates recipients, and limits email requests to
10 per minute per actor and organization per server process.

SMTP configuration is server-only:

- `WHOXOS_SMTP_HOST`: `glacier.mxrouting.net`
- `WHOXOS_SMTP_PORT`: `465` (implicit TLS); 587/2525 require STARTTLS
- `WHOXOS_SMTP_USER`: `noreply@overviewlabs.ai`
- `WHOXOS_SMTP_FROM`: `noreply@overviewlabs.ai`
- `WHOXOS_SMTP_PASSWORD_FILE`: absolute path to a service-readable, mode-0600
  secret file outside the repository

A configured HTTPS `auth.publicBaseUrl` is required for email links; request Host
headers cannot redirect recipients. TLS certificates are verified, debug logging
is off, and mail composition cannot read local attachments or fetch URLs.

`POST /api/companies/:companyId/invites` accepts `recipientEmail` and returns
`emailDelivery: { status: "sent" | "unconfirmed", recipient }` when requested.
`sent` means SMTP accepted the recipient/message, not proof of inbox placement.
If SMTP fails or its acknowledgement is lost, the response still contains the
valid invite link and reports unconfirmed delivery. The UI shows that result and
allows copying the link; it does not automatically resend. Audit entries record
invite creation and email delivery status without passwords or invite tokens.

Verify changes using `invitation-email.test.ts`, `invite-create-route.test.ts`,
`invite-url-public-base-url.test.ts`, and `InvitesSection.test.tsx`, plus UI
build/typecheck and token gates. Use an explicitly chosen recipient for live
SMTP delivery tests.

## Branded template

The invitation uses a responsive, table-based HTML layout with inline styles,
WHOXOS branding, explicit organization and role details, an acceptance
button, expiry, and a copyable link. Plain text remains available. The product's
existing `apple-touch-icon.png` is attached as a small inline PNG with Content-ID
`overview-labs-logo`; the HTML references it without remote image requests. The
asset is resolved from `ui/public` in source or `server/ui-dist` in the installed
package. Organization names and other dynamic values remain HTML-escaped.

Emailed invitations are bound to the canonical recipient address in server-owned
`defaultsPayload.recipientEmail` metadata, written before SMTP delivery. They
allow human joins only. Signup requires the same address; acceptance checks the
signed-in user's current database email before any invitation or membership
write. Addresses are trimmed and case-normalized; plus aliases and dotted
variants are not treated as equivalent. Client-supplied defaults cannot override
this binding, and malformed stored bindings fail closed.

The landing page locks the email and asks a new user only to choose a password
(the initial display name uses the email local part and can be changed later).
Existing users sign in; a different signed-in account must switch accounts.
Legacy invitations created without an email remain shareable links. Outstanding
previously emailed invitations can be bound using their `invite.email_delivery`
audit record; conflicting or invalid recipient records should be revoked rather
than converted to shareable links.

Invitation history shows the recipient address and email send result separately
from the invitation state and assigned role. Results come from durable,
organization-scoped `invite.email_delivery` audit events, including earlier sends.
“Sent” means the outgoing mail server accepted the message; it does not assert
inbox delivery. Unconfirmed sends remain labeled as such. Link-only invitations
show “Not emailed.” Revoking an invite preserves its send history. The table
refreshes after mutations, every 30 seconds while open, and on manual Refresh.
