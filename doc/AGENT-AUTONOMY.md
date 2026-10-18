# Agent autonomy and human escalation

The platform operating guidance in `packages/shared/src/agent-autonomy.ts` applies to existing and future agents in every organization. Model adapters and the native runtime receive it through `joinAgentPromptSections`; Gemini voice receives the same policy in its bound setup. Voice instruction revisions include the policy text and version so a changed policy invalidates stale instruction snapshots. It is prompt guidance, not a new permission grant or a guarantee about provider behavior.

Agents carry authorized work through implementation and verification. They inspect relevant permitted records and existing decisions, consult a peer for expertise, and route decisions outside their own authority to their manager and then an authorized CEO. Routine questions and confirmations use existing API resolver permissions or active executive delegation. They should not create a new human-only card for a routine decision an eligible agent can resolve.

An existing authenticated owner/administrator authorization for paid API usage remains effective within its recorded purpose, account and limits. The same authorized spending does not need another human decision solely because a call is paid. Actual budget limits, account access, licensing and provider requirements still apply; dedicated funds do not establish those facts.

Verified current operating directions supersede older generic agent wording that asks the owner about every routine step or repeats an already-granted spending decision. Custom role instructions and valid task-specific restrictions remain in place. The policy does not alter source instruction files, grant root access, bypass company isolation, approve credentials, make a colleague an eligible resolver, or replace a required independent review.

A human question is appropriate for a concrete dependency that authorized sources and team members cannot resolve: missing required information, personal/sensitive input, new access or account consent, an explicit human-only decision, or authorization outside existing grants. Agents should name the actual blocker and ask the smallest clear question, use the secure secret/connector flow rather than requesting credentials in chat, reuse existing pending questions, and continue unrelated authorized work. Progress and completion require actual evidence.

Regression coverage verifies final prompt assembly for fresh/resumed task and chat paths, organization data preservation, duplicate-policy prevention, Gemini model setups, and voice revision changes. Backend authorization and interaction resolver enforcement remain separate controls.

## Durable team decision delivery

Pending questions and ordinary confirmations addressed to a teammate are delivered by the durable interaction dispatcher. Unaddressed eligible cards can be routed to the currently delegated CEO. Delivery checks current organization membership, agent state, saved audience, issue access, and delegation. Explicit human addressees, personal conversations, credential/governed actions, required independent reviews and the creator's own cards are excluded. Voice-only work and interactions originating in direct voice do not silently start a text execution runtime.

Decision delivery uses `decisionIssueId`, rather than claiming the task as `issueId`/`taskId`. A colleague can therefore review a decision without checkout, reassignment, or cancellation because another agent owns the task. The request carries the actual responsible human (including parent-task inheritance), project, source run and exact interaction to inspect. Existing wake receipts suppress duplicate automatic delivery, including failed/skipped admissions; an explicit recovery action owns retry decisions. Startup and periodic reconciliation recover missed notifications. Sending a wake never approves or resolves the card.

## Small human requests

Task-chat question cards summarize long question-only headings and allow their full wording to be expanded. A single free-text answer opens directly without an extra radio selection. Validation and attachments still determine whether submission is available; Enter submits and Shift+Enter inserts a newline. Permission, risk and confirmation conditions remain visible. A short card does not change who may answer it or waive a missing fact.

The IT metadata endpoint also supports bounded historical reads so an authorized IT agent can obtain retained diagnostic evidence before requesting a human export. See `scripts/it-diagnostics/README.md` for exact access and coverage semantics. Available scan evidence is not proof of complete source retention.

## Silent skill use

Overview Labs agents select, read and apply skills internally. The platform communication policy applies the user's explicit preference to fresh and resumed task, chat, and voice prompts: omit routine skill names, loading notices and skill-use announcements; describe substantive work, verified results and actionable blockers. This preference takes precedence over reusable announcement templates. Explicit questions about skills and requested skill management remain supported.

Organization task/chat and Admin assistant presentation also suppress routine first-person skill-use announcements in historical replies and streamed progress. Human messages, code examples, attachments and raw run logs retain their original content. This presentation rule does not disable skills, required actions, permissions or auditing.
