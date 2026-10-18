# WHOXOS Mail

MXRoute-backed mailbox connector. Setup takes the existing mailbox email and password; the primary MX record must identify an MXRoute-owned server. IMAP uses TLS on 993 and SMTP uses TLS on 465 with certificate verification. The mailbox password uses the standard encrypted connection vault and is projected server-side only. WHOXOS Mail is an WHOXOS brand; its envelope icon is original artwork, not an MXRoute vendor mark.

Organization installations and grants retain normal company isolation. Per-agent Read mail and Write/send mail checkboxes are under Agent → Tools → Installed apps. Both default off. The gateway checks current permissions on every mail action, independently of broad tool profiles and prior approval. Read includes folders, search and message retrieval. Write includes sending plain-text messages and changing seen status. Agents cannot specify a different sender. Revocation and removal follow the standard connection lifecycle. The public credential-authenticated MCP bridge does not accept agent sessions or expose passwords; it authenticates against the actual mailbox.

Each mailbox operation is bounded, errors omit provider text/credentials, login failures are throttled, and send failures are never automatically retried by the bridge. A timeout after SMTP submission can have an uncertain outcome; inspect Sent/provider records before repeating. Sending does not currently append to Sent, handle attachments, or support drafts. Reads return bounded raw MIME (100 KB), which may need decoding; they do not mark mail read. Mail content is untrusted external data.

Provider reference: https://docs.mxroute.com/docs/quick-setup.html

Validation: `pnpm --filter @whoxos/server exec vitest run src/__tests__/whox-mail.test.ts`, server/UI typecheck, UI build, production authentication and a single internal delivery test. The live deployment must retain the runtime patches recorded in the release backup; do not replace unrelated runtime code wholesale.
