# Robinhood localhost sign-in in WHOXOS

Robinhood uses the official Streamable HTTP MCP endpoint
`https://agent.robinhood.com/mcp/trading`, OAuth authorization code with S256
PKCE, and the reviewed `internal` scope. Provider account/platform eligibility
still applies: https://robinhood.com/us/en/support/articles/agentic-trading-overview/

## Connect an organization

1. Select the intended organization, open Connectors, and choose Robinhood.
2. Start or resume sign-in. Robinhood opens in a new tab; WHOXOS stays open.
3. Complete Robinhood authentication, verification, and consent.
4. When redirected to `http://localhost:8765/callback?...`, copy the **entire**
   address-bar URL. A connection-error page is expected: no localhost server,
   remote browser, download, or terminal command is required.
5. Return to the previous WHOXOS tab, paste the URL into **Localhost
   callback URL**, and choose **Finish linking**.
6. Complete any remaining connector access configuration and verify its tools.

If the new tab was blocked, use **Open Robinhood in a new tab** in the dialog.
Keep the callback URL private: it contains a short-lived authorization code.
No additional Codex MCP configuration is needed; WHOXOS manages the
connector, user credential, and organization grants.

## Implementation

The `localhost` start mode is available only for the official Robinhood
connector. It uses a fixed redirect URI, random opaque state bound to the
registered client, and the existing stored PKCE verifier. The original redirect
is used for token exchange.

The callback URL is submitted in a POST body to
`/api/tools/oauth/:connectionId/callback-url`. The server parses it without
fetching it, validates the exact callback origin/path, rejects duplicate or
incomplete parameters, and checks that stored state belongs to this connector.
The existing callback handler enforces organization access, actor/login-session
binding, expiry, issuer checks, and atomic one-time state consumption. Other
connectors retain their hosted OAuth flow.

The callback field is masked and never persisted locally. Callback request
payloads and headers are excluded from application logs; responses use
`Cache-Control: no-store`. Codes are exchanged on the server, not in the browser.
Expired/consumed URLs require a fresh sign-in. Provider denials are recorded by
the existing connection-intent handler.

The remote-browser module, routes, UI, and dedicated Chromium installation have
been removed. Tests cover callback parsing, privacy, PKCE/redirect binding,
wrong-user rejection, and replay rejection. Account consent requires the user.
