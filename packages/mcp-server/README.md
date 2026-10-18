# WHOXOS MCP Server

Model Context Protocol server for WHOXOS.

This package is a thin MCP wrapper over the existing WHOXOS REST API. It does
not talk to the database directly and it does not reimplement business logic.

## Authentication

The server reads its configuration from environment variables:

- `WHOXOS_API_URL` - WHOXOS base URL, for example `http://localhost:3100`
- `WHOXOS_API_KEY` - bearer token used for `/api` requests
- `WHOXOS_COMPANY_ID` - optional default company for company-scoped tools
- `WHOXOS_AGENT_ID` - optional default agent for checkout helpers
- `WHOXOS_RUN_ID` - optional run id forwarded on mutating requests

Inside an active heartbeat, WHOXOS also injects `WHOXOS_RUNTIME_TOOLS_*` variables. They enable the run-scoped `connections_search` and `connection_request` tools and expire with the run.

## Usage

```sh
npx -y @whoxos/mcp-server
```

Or locally in this repo:

```sh
pnpm --filter @whoxos/mcp-server build
node packages/mcp-server/dist/stdio.js
```

## Tool Surface

Run-scoped connection tools:

- `connections_search`
- `connection_request`

Read tools:

- `whoxosMe`
- `whoxosInboxLite`
- `whoxosListAgents`
- `whoxosGetAgent`
- `whoxosListIssues`
- `whoxosGetIssue`
- `whoxosGetHeartbeatContext`
- `whoxosListComments`
- `whoxosGetComment`
- `whoxosListIssueApprovals`
- `whoxosListDocuments`
- `whoxosGetDocument`
- `whoxosListDocumentRevisions`
- `whoxosListProjects`
- `whoxosGetProject`
- `whoxosGetIssueWorkspaceRuntime`
- `whoxosWaitForIssueWorkspaceService`
- `whoxosListGoals`
- `whoxosGetGoal`
- `whoxosListApprovals`
- `whoxosGetApproval`
- `whoxosGetApprovalIssues`
- `whoxosListApprovalComments`

Write tools:

- `whoxosCreateIssue`
- `whoxosUpdateIssue`
- `whoxosCheckoutIssue`
- `whoxosReleaseIssue`
- `whoxosAddComment`
- `whoxosSuggestTasks`
- `whoxosAskUserQuestions`
- `whoxosRequestConfirmation`
- `whoxosUpsertIssueDocument`
- `whoxosRestoreIssueDocumentRevision`
- `whoxosControlIssueWorkspaceServices`
- `whoxosCreateApproval`
- `whoxosLinkIssueApproval`
- `whoxosUnlinkIssueApproval`
- `whoxosApprovalDecision`
- `whoxosAddApprovalComment`

Escape hatch:

- `whoxosApiRequest`

`whoxosApiRequest` is limited to paths under `/api` and JSON bodies. It is
meant for endpoints that do not yet have a dedicated MCP tool.
