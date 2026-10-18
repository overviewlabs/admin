<!-- GENERATED FILE — DO NOT EDIT. Run pnpm generate:capability-inventory. -->

# Capability Capability Contract

This generated contract is a self-contained derivative of the WHOXOS skill, its seven references, the WHOXOS Evals corpus, and the legacy MCP tool surface. It does not import or contact the WHOXOS control plane.

The skill/reference inventory and eval cases are the only normative behavior sources. WHOXOS does not use the legacy MCP calls as a production capability surface; all MCP names below are traceability aliases folded into normative eval rows. Their disposition, grants, assertions, and evidence contract are inherited from the target row rather than classified independently.

## Baseline Counts

- Skill/reference headings: 156
- Eval cases: 106 across 16 groups
- Total normative rows: 262
- Legacy MCP aliases folded into normative rows: 42

| Eval group | Cases |
| --- | ---: |
| hb | 5 |
| co | 6 |
| st | 8 |
| cm | 6 |
| se | 4 |
| su | 4 |
| bl | 5 |
| dp | 3 |
| ix | 9 |
| ap | 6 |
| ar | 4 |
| er | 9 |
| rf | 22 |
| mh | 4 |
| rs | 3 |
| wk | 8 |

## Regeneration

- `pnpm --dir packages/whoxos-runner generate:capability-inventory` imports the canonical baselines and rewrites every generated file.
- `pnpm --dir packages/whoxos-runner check:capability-inventory` validates counts, uniqueness, normative dispositions, one-to-one MCP folds, required fields, and generated-file drift without requiring the external eval repository.

## Skill / Reference Rows

| Capability | Primary disposition | Source anchor |
| --- | --- | --- |
| skill:skills/whoxos/SKILL.md:whoxos-skill:11 | optional_agent_tool | skills/whoxos/SKILL.md:11 |
| skill:skills/whoxos/SKILL.md:quiet-routine-coordination:15 | optional_agent_tool | skills/whoxos/SKILL.md:15 |
| skill:skills/whoxos/SKILL.md:terminology:23 | optional_agent_tool | skills/whoxos/SKILL.md:23 |
| skill:skills/whoxos/SKILL.md:authentication:27 | control_plane_owned | skills/whoxos/SKILL.md:27 |
| skill:skills/whoxos/SKILL.md:conversation-tasks:39 | optional_agent_tool | skills/whoxos/SKILL.md:39 |
| skill:skills/whoxos/SKILL.md:server-verified-external-chat-turns:56 | control_plane_owned | skills/whoxos/SKILL.md:56 |
| skill:skills/whoxos/SKILL.md:the-heartbeat-procedure:96 | optional_agent_tool | skills/whoxos/SKILL.md:96 |
| skill:skills/whoxos/SKILL.md:generated-artifacts-and-work-products:168 | always_agent_tool | skills/whoxos/SKILL.md:168 |
| skill:skills/whoxos/SKILL.md:status-quick-guide:216 | control_plane_owned | skills/whoxos/SKILL.md:216 |
| skill:skills/whoxos/SKILL.md:monitors-and-watchers-say-only-what-you-actually-scheduled:226 | optional_agent_tool | skills/whoxos/SKILL.md:226 |
| skill:skills/whoxos/SKILL.md:delegating-review-tasks:239 | always_agent_tool | skills/whoxos/SKILL.md:239 |
| skill:skills/whoxos/SKILL.md:managing-a-user-s-inbox:250 | control_plane_owned | skills/whoxos/SKILL.md:250 |
| skill:skills/whoxos/SKILL.md:issue-dependencies-blockers:258 | control_plane_owned | skills/whoxos/SKILL.md:258 |
| skill:skills/whoxos/SKILL.md:requesting-board-approval:283 | optional_agent_tool | skills/whoxos/SKILL.md:283 |
| skill:skills/whoxos/SKILL.md:issue-thread-interactions:304 | optional_agent_tool | skills/whoxos/SKILL.md:304 |
| skill:skills/whoxos/SKILL.md:standalone-decisions:333 | optional_agent_tool | skills/whoxos/SKILL.md:333 |
| skill:skills/whoxos/SKILL.md:mcp-tool-approval-gates:437 | optional_agent_tool | skills/whoxos/SKILL.md:437 |
| skill:skills/whoxos/SKILL.md:niche-workflow-pointers:479 | optional_agent_tool | skills/whoxos/SKILL.md:479 |
| skill:skills/whoxos/SKILL.md:cases:489 | optional_agent_tool | skills/whoxos/SKILL.md:489 |
| skill:skills/whoxos/SKILL.md:company-skills-workflow:494 | optional_agent_tool | skills/whoxos/SKILL.md:494 |
| skill:skills/whoxos/SKILL.md:routines:505 | optional_agent_tool | skills/whoxos/SKILL.md:505 |
| skill:skills/whoxos/SKILL.md:issue-workspace-runtime-controls:516 | optional_agent_tool | skills/whoxos/SKILL.md:516 |
| skill:skills/whoxos/SKILL.md:proposing-credentials-safely:523 | optional_agent_tool | skills/whoxos/SKILL.md:523 |
| skill:skills/whoxos/SKILL.md:reading-granted-secrets:530 | optional_agent_tool | skills/whoxos/SKILL.md:530 |
| skill:skills/whoxos/SKILL.md:critical-rules:556 | optional_agent_tool | skills/whoxos/SKILL.md:556 |
| skill:skills/whoxos/SKILL.md:comment-style-required:580 | always_agent_tool | skills/whoxos/SKILL.md:580 |
| skill:skills/whoxos/SKILL.md:update:612 | optional_agent_tool | skills/whoxos/SKILL.md:612 |
| skill:skills/whoxos/SKILL.md:planning-required-when-planning-requested:622 | optional_agent_tool | skills/whoxos/SKILL.md:622 |
| skill:skills/whoxos/SKILL.md:key-endpoints-hot-routes:655 | optional_agent_tool | skills/whoxos/SKILL.md:655 |
| skill:skills/whoxos/SKILL.md:searching-issues:684 | optional_agent_tool | skills/whoxos/SKILL.md:684 |
| skill:skills/whoxos/SKILL.md:full-reference:694 | optional_agent_tool | skills/whoxos/SKILL.md:694 |
| skill:skills/whoxos/references/artifacts.md:generated-artifacts-and-work-products:1 | always_agent_tool | skills/whoxos/references/artifacts.md:1 |
| skill:skills/whoxos/references/artifacts.md:workspace-only-file-references:15 | optional_agent_tool | skills/whoxos/references/artifacts.md:15 |
| skill:skills/whoxos/references/cases.md:cases:1 | optional_agent_tool | skills/whoxos/references/cases.md:1 |
| skill:skills/whoxos/references/cases.md:core-model:12 | optional_agent_tool | skills/whoxos/references/cases.md:12 |
| skill:skills/whoxos/references/cases.md:upsert-semantics:29 | optional_agent_tool | skills/whoxos/references/cases.md:29 |
| skill:skills/whoxos/references/cases.md:read-and-search:67 | optional_agent_tool | skills/whoxos/references/cases.md:67 |
| skill:skills/whoxos/references/cases.md:documents:90 | always_agent_tool | skills/whoxos/references/cases.md:90 |
| skill:skills/whoxos/references/cases.md:fields:118 | optional_agent_tool | skills/whoxos/references/cases.md:118 |
| skill:skills/whoxos/references/cases.md:issue-links:151 | optional_agent_tool | skills/whoxos/references/cases.md:151 |
| skill:skills/whoxos/references/cases.md:child-cases:176 | optional_agent_tool | skills/whoxos/references/cases.md:176 |
| skill:skills/whoxos/references/cases.md:attachments:195 | optional_agent_tool | skills/whoxos/references/cases.md:195 |
| skill:skills/whoxos/references/cases.md:lifecycle:208 | optional_agent_tool | skills/whoxos/references/cases.md:208 |
| skill:skills/whoxos/references/cases.md:worked-blog-post-example:222 | optional_agent_tool | skills/whoxos/references/cases.md:222 |
| skill:skills/whoxos/references/company-skills.md:company-skills-workflow:1 | optional_agent_tool | skills/whoxos/references/company-skills.md:1 |
| skill:skills/whoxos/references/company-skills.md:what-exists:5 | optional_agent_tool | skills/whoxos/references/company-skills.md:5 |
| skill:skills/whoxos/references/company-skills.md:permission-model:22 | optional_agent_tool | skills/whoxos/references/company-skills.md:22 |
| skill:skills/whoxos/references/company-skills.md:core-endpoints:29 | optional_agent_tool | skills/whoxos/references/company-skills.md:29 |
| skill:skills/whoxos/references/company-skills.md:install-a-skill-into-the-company:65 | optional_agent_tool | skills/whoxos/references/company-skills.md:65 |
| skill:skills/whoxos/references/company-skills.md:app-shipped-catalog:75 | optional_agent_tool | skills/whoxos/references/company-skills.md:75 |
| skill:skills/whoxos/references/company-skills.md:external-source-import:101 | optional_agent_tool | skills/whoxos/references/company-skills.md:101 |
| skill:skills/whoxos/references/company-skills.md:source-types-in-order-of-preference:105 | optional_agent_tool | skills/whoxos/references/company-skills.md:105 |
| skill:skills/whoxos/references/company-skills.md:example-skills-sh-import-preferred:116 | optional_agent_tool | skills/whoxos/references/company-skills.md:116 |
| skill:skills/whoxos/references/company-skills.md:example-github-import:138 | optional_agent_tool | skills/whoxos/references/company-skills.md:138 |
| skill:skills/whoxos/references/company-skills.md:inspect-what-was-installed:164 | optional_agent_tool | skills/whoxos/references/company-skills.md:164 |
| skill:skills/whoxos/references/company-skills.md:assign-skills-to-an-existing-agent:181 | optional_agent_tool | skills/whoxos/references/company-skills.md:181 |
| skill:skills/whoxos/references/company-skills.md:include-skills-during-hire-or-create:216 | optional_agent_tool | skills/whoxos/references/company-skills.md:216 |
| skill:skills/whoxos/references/company-skills.md:notes:256 | optional_agent_tool | skills/whoxos/references/company-skills.md:256 |
| skill:skills/whoxos/references/issue-workspaces.md:issue-workspace-runtime-controls:1 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:1 |
| skill:skills/whoxos/references/issue-workspaces.md:discover-the-workspace:5 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:5 |
| skill:skills/whoxos/references/issue-workspaces.md:control-services:23 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:23 |
| skill:skills/whoxos/references/issue-workspaces.md:start-all-configured-services-waits-for-configured-readiness-checks:28 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:28 |
| skill:skills/whoxos/references/issue-workspaces.md:restart-all-configured-services:36 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:36 |
| skill:skills/whoxos/references/issue-workspaces.md:stop-all-running-services:44 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:44 |
| skill:skills/whoxos/references/issue-workspaces.md:read-the-url:63 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:63 |
| skill:skills/whoxos/references/issue-workspaces.md:mcp-tools:72 | optional_agent_tool | skills/whoxos/references/issue-workspaces.md:72 |
| skill:skills/whoxos/references/routines.md:whoxos-routines:1 | optional_agent_tool | skills/whoxos/references/routines.md:1 |
| skill:skills/whoxos/references/routines.md:lifecycle:16 | optional_agent_tool | skills/whoxos/references/routines.md:16 |
| skill:skills/whoxos/references/routines.md:creating-a-routine:27 | optional_agent_tool | skills/whoxos/references/routines.md:27 |
| skill:skills/whoxos/references/routines.md:concurrency-policies:64 | optional_agent_tool | skills/whoxos/references/routines.md:64 |
| skill:skills/whoxos/references/routines.md:catch-up-policies:76 | optional_agent_tool | skills/whoxos/references/routines.md:76 |
| skill:skills/whoxos/references/routines.md:activity-gated-scheduled-runs:87 | optional_agent_tool | skills/whoxos/references/routines.md:87 |
| skill:skills/whoxos/references/routines.md:example-skip-quiet-nights:107 | optional_agent_tool | skills/whoxos/references/routines.md:107 |
| skill:skills/whoxos/references/routines.md:adding-triggers:126 | optional_agent_tool | skills/whoxos/references/routines.md:126 |
| skill:skills/whoxos/references/routines.md:schedule-cron:136 | optional_agent_tool | skills/whoxos/references/routines.md:136 |
| skill:skills/whoxos/references/routines.md:webhook:150 | optional_agent_tool | skills/whoxos/references/routines.md:150 |
| skill:skills/whoxos/references/routines.md:api-manual-only:167 | optional_agent_tool | skills/whoxos/references/routines.md:167 |
| skill:skills/whoxos/references/routines.md:updating-and-deleting-triggers:179 | optional_agent_tool | skills/whoxos/references/routines.md:179 |
| skill:skills/whoxos/references/routines.md:manual-run:196 | optional_agent_tool | skills/whoxos/references/routines.md:196 |
| skill:skills/whoxos/references/routines.md:updating-a-routine:212 | optional_agent_tool | skills/whoxos/references/routines.md:212 |
| skill:skills/whoxos/references/routines.md:reading-routines-and-runs:223 | optional_agent_tool | skills/whoxos/references/routines.md:223 |
| skill:skills/whoxos/references/workflows.md:whoxos-workflow-playbooks:1 | optional_agent_tool | skills/whoxos/references/workflows.md:1 |
| skill:skills/whoxos/references/workflows.md:project-setup-ceo-manager:7 | optional_agent_tool | skills/whoxos/references/workflows.md:7 |
| skill:skills/whoxos/references/workflows.md:openclaw-invite-ceo:22 | optional_agent_tool | skills/whoxos/references/workflows.md:22 |
| skill:skills/whoxos/references/workflows.md:setting-agent-instructions-path:50 | optional_agent_tool | skills/whoxos/references/workflows.md:50 |
| skill:skills/whoxos/references/workflows.md:company-import-export:79 | optional_agent_tool | skills/whoxos/references/workflows.md:79 |
| skill:skills/whoxos/references/workflows.md:self-test-playbook-app-level:106 | optional_agent_tool | skills/whoxos/references/workflows.md:106 |
| skill:skills/whoxos/references/api-reference.md:whoxos-api-reference:1 | optional_agent_tool | skills/whoxos/references/api-reference.md:1 |
| skill:skills/whoxos/references/api-reference.md:response-schemas:9 | optional_agent_tool | skills/whoxos/references/api-reference.md:9 |
| skill:skills/whoxos/references/api-reference.md:agent-record-get-api-agents-me-or-get-api-agents-agentid:11 | optional_agent_tool | skills/whoxos/references/api-reference.md:11 |
| skill:skills/whoxos/references/api-reference.md:company-portability:44 | optional_agent_tool | skills/whoxos/references/api-reference.md:44 |
| skill:skills/whoxos/references/api-reference.md:issue-with-ancestors-get-api-issues-issueid:110 | optional_agent_tool | skills/whoxos/references/api-reference.md:110 |
| skill:skills/whoxos/references/api-reference.md:issue-update-response-patch-api-issues-issueid:196 | optional_agent_tool | skills/whoxos/references/api-reference.md:196 |
| skill:skills/whoxos/references/api-reference.md:blocker-diagnostics-get-api-issues-issueid-diagnostics-blockers:238 | control_plane_owned | skills/whoxos/references/api-reference.md:238 |
| skill:skills/whoxos/references/api-reference.md:wake-diagnostics-get-api-issues-issueid-diagnostics-wakes:277 | control_plane_owned | skills/whoxos/references/api-reference.md:277 |
| skill:skills/whoxos/references/api-reference.md:subtree-diagnostics-get-api-issues-issueid-diagnostics-subtree:321 | optional_agent_tool | skills/whoxos/references/api-reference.md:321 |
| skill:skills/whoxos/references/api-reference.md:execution-policy-fields-on-an-issue:369 | optional_agent_tool | skills/whoxos/references/api-reference.md:369 |
| skill:skills/whoxos/references/api-reference.md:cross-agent-review-gates:421 | always_agent_tool | skills/whoxos/references/api-reference.md:421 |
| skill:skills/whoxos/references/api-reference.md:worked-example-ic-heartbeat:454 | optional_agent_tool | skills/whoxos/references/api-reference.md:454 |
| skill:skills/whoxos/references/api-reference.md:1-identity-skip-if-already-in-context:459 | control_plane_owned | skills/whoxos/references/api-reference.md:459 |
| skill:skills/whoxos/references/api-reference.md:2-check-inbox:463 | control_plane_owned | skills/whoxos/references/api-reference.md:463 |
| skill:skills/whoxos/references/api-reference.md:3-already-have-issue-101-inprogress-highest-priority-continue-it:470 | optional_agent_tool | skills/whoxos/references/api-reference.md:470 |
| skill:skills/whoxos/references/api-reference.md:4-do-the-actual-work-write-code-run-tests:477 | optional_agent_tool | skills/whoxos/references/api-reference.md:477 |
| skill:skills/whoxos/references/api-reference.md:5-work-is-done-update-status-and-comment-in-one-call:479 | always_agent_tool | skills/whoxos/references/api-reference.md:479 |
| skill:skills/whoxos/references/api-reference.md:6-still-have-time-checkout-the-next-task:483 | control_plane_owned | skills/whoxos/references/api-reference.md:483 |
| skill:skills/whoxos/references/api-reference.md:7-made-partial-progress-not-done-yet-comment-and-exit:490 | always_agent_tool | skills/whoxos/references/api-reference.md:490 |
| skill:skills/whoxos/references/api-reference.md:worked-example-report-a-board-user-s-mine-inbox:495 | control_plane_owned | skills/whoxos/references/api-reference.md:495 |
| skill:skills/whoxos/references/api-reference.md:board-user-created-the-requesting-issue:500 | optional_agent_tool | skills/whoxos/references/api-reference.md:500 |
| skill:skills/whoxos/references/api-reference.md:fetch-the-board-user-s-mine-inbox-issues:504 | control_plane_owned | skills/whoxos/references/api-reference.md:504 |
| skill:skills/whoxos/references/api-reference.md:summarize-it-back-to-the-board-in-a-comment-or-document:518 | always_agent_tool | skills/whoxos/references/api-reference.md:518 |
| skill:skills/whoxos/references/api-reference.md:worked-example-archive-a-resolved-inbox-item:523 | control_plane_owned | skills/whoxos/references/api-reference.md:523 |
| skill:skills/whoxos/references/api-reference.md:the-responsible-user-s-id-is-resolved-from-the-authenticated-agent-run:528 | optional_agent_tool | skills/whoxos/references/api-reference.md:528 |
| skill:skills/whoxos/references/api-reference.md:reverse-the-archive-if-it-was-premature-or-no-longer-desired:537 | optional_agent_tool | skills/whoxos/references/api-reference.md:537 |
| skill:skills/whoxos/references/api-reference.md:worked-example-reviewer-approver-heartbeat:547 | always_agent_tool | skills/whoxos/references/api-reference.md:547 |
| skill:skills/whoxos/references/api-reference.md:worked-example-manager-heartbeat:586 | optional_agent_tool | skills/whoxos/references/api-reference.md:586 |
| skill:skills/whoxos/references/api-reference.md:1-identity-skip-if-already-in-context:589 | control_plane_owned | skills/whoxos/references/api-reference.md:589 |
| skill:skills/whoxos/references/api-reference.md:2-check-team-status:593 | optional_agent_tool | skills/whoxos/references/api-reference.md:593 |
| skill:skills/whoxos/references/api-reference.md:3-agent-42-is-blocked-read-comments:600 | control_plane_owned | skills/whoxos/references/api-reference.md:600 |
| skill:skills/whoxos/references/api-reference.md:4-unblock-reassign-and-comment:604 | control_plane_owned | skills/whoxos/references/api-reference.md:604 |
| skill:skills/whoxos/references/api-reference.md:5-check-own-assignments:608 | optional_agent_tool | skills/whoxos/references/api-reference.md:608 |
| skill:skills/whoxos/references/api-reference.md:6-create-subtasks-and-delegate:615 | optional_agent_tool | skills/whoxos/references/api-reference.md:615 |
| skill:skills/whoxos/references/api-reference.md:load-tests-depend-on-caching-layer-being-done-first-whoxos-will-auto-wake-agent-55-when-the-blocker-resolves:621 | control_plane_owned | skills/whoxos/references/api-reference.md:621 |
| skill:skills/whoxos/references/api-reference.md:7-dashboard-for-health-check:626 | optional_agent_tool | skills/whoxos/references/api-reference.md:626 |
| skill:skills/whoxos/references/api-reference.md:comments-and-mentions:632 | always_agent_tool | skills/whoxos/references/api-reference.md:632 |
| skill:skills/whoxos/references/api-reference.md:update:639 | optional_agent_tool | skills/whoxos/references/api-reference.md:639 |
| skill:skills/whoxos/references/api-reference.md:cross-team-work-and-delegation:677 | optional_agent_tool | skills/whoxos/references/api-reference.md:677 |
| skill:skills/whoxos/references/api-reference.md:receiving-cross-team-work:681 | optional_agent_tool | skills/whoxos/references/api-reference.md:681 |
| skill:skills/whoxos/references/api-reference.md:escalation:691 | optional_agent_tool | skills/whoxos/references/api-reference.md:691 |
| skill:skills/whoxos/references/api-reference.md:company-context:701 | optional_agent_tool | skills/whoxos/references/api-reference.md:701 |
| skill:skills/whoxos/references/api-reference.md:company-branding-ceo-board:713 | optional_agent_tool | skills/whoxos/references/api-reference.md:713 |
| skill:skills/whoxos/references/api-reference.md:openclaw-invite-prompt-ceo:733 | optional_agent_tool | skills/whoxos/references/api-reference.md:733 |
| skill:skills/whoxos/references/api-reference.md:setting-agent-instructions-path:752 | optional_agent_tool | skills/whoxos/references/api-reference.md:752 |
| skill:skills/whoxos/references/api-reference.md:project-setup-create-workspace:785 | optional_agent_tool | skills/whoxos/references/api-reference.md:785 |
| skill:skills/whoxos/references/api-reference.md:option-a-one-call-create-with-workspace:809 | optional_agent_tool | skills/whoxos/references/api-reference.md:809 |
| skill:skills/whoxos/references/api-reference.md:option-b-two-calls-project-first-then-workspace:828 | optional_agent_tool | skills/whoxos/references/api-reference.md:828 |
| skill:skills/whoxos/references/api-reference.md:governance-and-approvals:857 | optional_agent_tool | skills/whoxos/references/api-reference.md:857 |
| skill:skills/whoxos/references/api-reference.md:requesting-a-hire-management-only:861 | optional_agent_tool | skills/whoxos/references/api-reference.md:861 |
| skill:skills/whoxos/references/api-reference.md:ceo-strategy-approval:893 | optional_agent_tool | skills/whoxos/references/api-reference.md:893 |
| skill:skills/whoxos/references/api-reference.md:questions-and-waiting-for-human-input:902 | always_agent_tool | skills/whoxos/references/api-reference.md:902 |
| skill:skills/whoxos/references/api-reference.md:issue-thread-confirmations:984 | always_agent_tool | skills/whoxos/references/api-reference.md:984 |
| skill:skills/whoxos/references/api-reference.md:checkbox-confirmations:1042 | always_agent_tool | skills/whoxos/references/api-reference.md:1042 |
| skill:skills/whoxos/references/api-reference.md:item-verdict-requests:1157 | optional_agent_tool | skills/whoxos/references/api-reference.md:1157 |
| skill:skills/whoxos/references/api-reference.md:checking-approval-status:1267 | optional_agent_tool | skills/whoxos/references/api-reference.md:1267 |
| skill:skills/whoxos/references/api-reference.md:approval-follow-up-requesting-agent:1273 | always_agent_tool | skills/whoxos/references/api-reference.md:1273 |
| skill:skills/whoxos/references/api-reference.md:issue-lifecycle:1291 | always_agent_tool | skills/whoxos/references/api-reference.md:1291 |
| skill:skills/whoxos/references/api-reference.md:error-handling:1321 | control_plane_owned | skills/whoxos/references/api-reference.md:1321 |
| skill:skills/whoxos/references/api-reference.md:full-api-reference:1335 | optional_agent_tool | skills/whoxos/references/api-reference.md:1335 |
| skill:skills/whoxos/references/api-reference.md:agents:1337 | optional_agent_tool | skills/whoxos/references/api-reference.md:1337 |
| skill:skills/whoxos/references/api-reference.md:issues-tasks:1358 | optional_agent_tool | skills/whoxos/references/api-reference.md:1358 |
| skill:skills/whoxos/references/api-reference.md:companies-projects-goals:1398 | optional_agent_tool | skills/whoxos/references/api-reference.md:1398 |
| skill:skills/whoxos/references/api-reference.md:routines:1422 | optional_agent_tool | skills/whoxos/references/api-reference.md:1422 |
| skill:skills/whoxos/references/api-reference.md:approvals-costs-activity-dashboard:1438 | optional_agent_tool | skills/whoxos/references/api-reference.md:1438 |
| skill:skills/whoxos/references/api-reference.md:secrets:1460 | optional_agent_tool | skills/whoxos/references/api-reference.md:1460 |
| skill:skills/whoxos/references/api-reference.md:agent-secret-proposals:1473 | optional_agent_tool | skills/whoxos/references/api-reference.md:1473 |
| skill:skills/whoxos/references/api-reference.md:agent-secret-access:1573 | optional_agent_tool | skills/whoxos/references/api-reference.md:1573 |
| skill:skills/whoxos/references/api-reference.md:common-mistakes:1613 | optional_agent_tool | skills/whoxos/references/api-reference.md:1613 |

## Legacy MCP Alias Index

This is a compatibility/traceability index, not a tool catalog. “Inherited disposition” is shown only to make the normative target easy to audit.

| Legacy MCP name | Folded into normative row | Inherited disposition | Source anchor |
| --- | --- | --- | --- |
| whoxosMe | eval:hb-inbox-lite-01 | control_plane_owned | packages/mcp-server/src/tools.ts:290 |
| whoxosInboxLite | eval:hb-inbox-lite-01 | control_plane_owned | packages/mcp-server/src/tools.ts:296 |
| whoxosListAgents | eval:rf-api-mgr-heartbeat-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:302 |
| whoxosListSkills | eval:rf-cskill-audit-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:308 |
| whoxosGetAgent | eval:rf-api-mgr-heartbeat-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:314 |
| whoxosListIssues | eval:se-q-filters-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:323 |
| whoxosGetIssue | eval:se-get-issue-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:338 |
| whoxosGetHeartbeatContext | eval:hb-context-01 | control_plane_owned | packages/mcp-server/src/tools.ts:344 |
| whoxosListComments | eval:se-get-issue-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:353 |
| whoxosGetComment | eval:hb-wake-comment-01 | control_plane_owned | packages/mcp-server/src/tools.ts:366 |
| whoxosListIssueApprovals | eval:ap-board-approval-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:373 |
| whoxosListDocuments | eval:dp-base-revision-01 | always_agent_tool | packages/mcp-server/src/tools.ts:379 |
| whoxosGetDocument | eval:dp-base-revision-01 | always_agent_tool | packages/mcp-server/src/tools.ts:385 |
| whoxosListDocumentRevisions | eval:dp-base-revision-01 | always_agent_tool | packages/mcp-server/src/tools.ts:392 |
| whoxosListProjects | eval:rf-wf-project-setup-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:402 |
| whoxosGetProject | eval:rf-wf-project-setup-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:408 |
| whoxosGetIssueWorkspaceRuntime | eval:rf-iws-start-url-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:417 |
| whoxosControlIssueWorkspaceServices | eval:rf-iws-start-url-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:423 |
| whoxosWaitForIssueWorkspaceService | eval:rf-iws-target-restart-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:440 |
| whoxosListGoals | eval:su-parent-goal-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:466 |
| whoxosGetGoal | eval:su-parent-goal-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:472 |
| whoxosListApprovals | eval:ap-approval-wake-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:478 |
| whoxosCreateApproval | eval:ap-board-approval-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:487 |
| whoxosGetApproval | eval:ap-approval-wake-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:496 |
| whoxosGetApprovalIssues | eval:ap-approval-wake-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:502 |
| whoxosListApprovalComments | eval:ap-approval-deny-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:508 |
| whoxosCreateIssue | eval:su-parent-goal-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:514 |
| whoxosUpdateIssue | eval:st-done-comment-01 | always_agent_tool | packages/mcp-server/src/tools.ts:521 |
| whoxosCheckoutIssue | eval:co-body-contract-01 | control_plane_owned | packages/mcp-server/src/tools.ts:528 |
| whoxosReleaseIssue | eval:er-release-01 | control_plane_owned | packages/mcp-server/src/tools.ts:540 |
| whoxosAddComment | eval:cm-multiline-01 | always_agent_tool | packages/mcp-server/src/tools.ts:546 |
| whoxosSuggestTasks | eval:ix-suggest-tasks-01 | always_agent_tool | packages/mcp-server/src/tools.ts:553 |
| whoxosAskUserQuestions | eval:ix-questions-01 | always_agent_tool | packages/mcp-server/src/tools.ts:565 |
| whoxosRequestConfirmation | eval:ix-confirmation-plan-01 | always_agent_tool | packages/mcp-server/src/tools.ts:577 |
| whoxosRequestCheckboxConfirmation | eval:ix-checkbox-01 | always_agent_tool | packages/mcp-server/src/tools.ts:589 |
| whoxosUpsertIssueDocument | eval:dp-plan-doc-01 | always_agent_tool | packages/mcp-server/src/tools.ts:601 |
| whoxosRestoreIssueDocumentRevision | eval:dp-base-revision-01 | always_agent_tool | packages/mcp-server/src/tools.ts:612 |
| whoxosLinkIssueApproval | eval:ap-board-approval-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:627 |
| whoxosUnlinkIssueApproval | eval:ap-board-approval-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:636 |
| whoxosApprovalDecision | eval:ap-approval-wake-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:646 |
| whoxosAddApprovalComment | eval:ap-approval-deny-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:668 |
| whoxosApiRequest | eval:rf-api-404-report-01 | optional_agent_tool | packages/mcp-server/src/tools.ts:677 |
