# Robinhood and Higgsfield connections

Verified 2026-09-30. These catalog definitions use the existing remote HTTP MCP
transport, OAuth broker, encrypted instance vault, agent grants, action policies,
and audit trail. No separate execution adapter or provider password is needed.

Sign-in tokens are never reused as resource tokens; id.whoxos.ing never
stores resource tokens; no connections hub on the ID service.

## Setup

In the desired organization's Connectors page, select Robinhood or Higgsfield,
connect a personal account through the provider's consent page, then choose agents
and permitted actions in Permissions. Connection ownership remains user-bound;
agent access is explicit and scoped to the selected organization. Revoke the
connection or remove an agent grant to stop subsequent calls.

- Robinhood: https://agent.robinhood.com/mcp/trading. Desktop sign-in and
  Robinhood Agentic account onboarding are required. The provider permits reads
  across the owner's Robinhood accounts, but trades only in its dedicated Agentic
  account. S4 classification preserves the existing action-policy mechanism.
  Connecting alone neither places orders nor establishes a trading strategy.
- Higgsfield: https://mcp.higgsfield.ai/mcp. Requires a paid subscription.
  Model discovery, image/video/audio generation and editing, generation status,
  and asset retrieval depend on the provider's authenticated tool catalog.
  Generation consumes account credits. The integration uses that live catalog
  rather than maintaining guessed tool names or model parameters.

Official setup references:
- https://robinhood.com/us/en/support/articles/agentic-trading-overview/
- https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent

## Public protocol evidence

Unauthenticated GET to Robinhood's MCP endpoint returns 405. Its resource
metadata at `/.well-known/oauth-protected-resource/mcp/trading` advertises
`https://agent.robinhood.com/mcp/trading` as the authorization server and scope
`internal`. Authorization-server discovery advertises:

- authorization: `https://robinhood.com/oauth`
- token: `https://api.robinhood.com/oauth2/token/`
- registration: `https://agent.robinhood.com/oauth/trading/register`
- PKCE S256, public-client authentication, authorization_code and refresh_token.

Higgsfield's endpoint returns 401 with a resource metadata challenge at
`https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp`.
Its authorization-code server is `https://clerk.higgsfield.ai`, advertising
`/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth/token/revoke`,
PKCE S256, refresh tokens, and client-ID metadata documents. The device-code
server is also advertised, but the app uses the existing browser callback flow.
Only the resource-required `openid email offline_access` scopes are requested,
not Clerk's additional profile/private metadata scopes.

Discovery remains authoritative: no fixed authorization/token pair bypasses it.
The common broker handles registration or client metadata, refresh and revocation.
Account-specific token lifetimes, refresh rotation, provider redirect acceptance,
and full tool lists require actual account consent and were not inferred from
public metadata. No registration, order or paid generation is used as a probe.

## Branding provenance

Official provider assets copied without modification:
- Robinhood: https://robinhood.com/us/en/rh_favicon_152.png?v=2024 (152x152).
- Higgsfield: https://higgsfield.ai/apple-touch-icon.png (180x180).

## Regeneration and verification

Definitions are authored in `scripts/ingest-app-definitions.mjs`; the research
ledger supplies eligibility. To update these providers without the optional
external 99-capture research checkout:

```sh
node scripts/ingest-app-definitions.mjs --only=robinhood,higgsfield
node scripts/check-app-brand-assets.mjs
pnpm exec vitest run packages/shared/src/agentic-creative-connectors.test.ts packages/shared/src/app-definitions.test.ts ui/src/pages/apps/app-connect-policy.test.ts server/src/__tests__/generic-mcp-connection.test.ts
```

The scoped generator preserves unrelated definitions and registry order. The
full generator remains available with its research capture corpus.

Acceptance: both store entries are available; the common wizard chooses hosted
OAuth; secrets never enter catalog metadata; organization/agent grants remain
mandatory; broker discovery works without account mutation. After the user
connects, verify catalog refresh and a read-only portfolio/account query or
Higgsfield balance/recent-generation query, then verify revocation. Actual
trading and paid generation are not part of connector installation testing.
