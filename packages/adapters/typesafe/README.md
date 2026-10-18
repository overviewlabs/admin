# TypeSafe Jev adapter

This adapter runs TypeSafe's System One API from WHOXOS. Jev evaluates typed questions and returns decisions; it does not generate conversations, edit code, execute tools, or authorize downstream actions.

Install this package through Settings → Adapters as a local adapter package, or the authenticated `POST /api/adapters/install` endpoint with `isLocalPath: true`. The registered adapter type is `typesafe`. Its schema uses the existing WHOXOS configuration controls, and its parser renders evaluation results in the existing run transcript.

Select `jev-latest`, `jev-preview`, or `jev-1.13.0`. Store your TypeSafe key in Settings → Secrets, then assign that secret to `TYPESAFE_API_KEY` in the agent's Environment variables. The adapter intentionally does not inherit a host API key.

Use the organization's **Real-Time Decision Engine**. Users may inspect its configuration and choose the Jev model, but cannot chat with it or run evaluations directly. Organization agents call it using the scoped tools described below; the caller supplies the questions and state for each evaluation. Fixed question/state configuration is ignored for delegated evaluations. Installing this package alone does not provision the organization service; the server's organization-creation and startup hooks do that.

A caller supplies **typed questions**, for example:

```json
{
  "urgent": { "type": "noul", "instructions": "Does this express urgency?" },
  "team": {
    "type": "choice",
    "instructions": "Which team should handle this?",
    "criteria": { "technical": "Integration problems", "billing": "Payments" }
  },
  "frustration": {
    "type": "score",
    "instructions": "How frustrated is the customer?",
    "criteria": ["Calm", "Frustrated", "Very angry"]
  }
}
```

Only the supplied state and typed questions are sent to TypeSafe. The entire run context and runtime credentials are not transmitted.

**Test** performs a small authenticated synthetic evaluation using the selected model. Missing keys and malformed configurations fail explicitly. A successful run stores typed answers, confidence and probability distributions, the actual resolved model, and per-run token usage. Billed dollar amounts are not invented from an estimate.

Requests and responses are bounded to 1 MiB. The timeout covers the request and backoff. Only explicit HTTP 429/529 rejections are retried (at most three retries); ambiguous network failures and timeouts are not replayed. Operator cancellation aborts the request. Unsupported remote or denied-network execution is rejected.

Run `npm test` in this directory to validate the adapter with a controlled provider fixture. An actual TypeSafe account test additionally requires a key.

Official references: [API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [coding-agent compatibility](https://docs.typesafe.ai/introduction/coding-agents).

## Organization decision service

Every organization receives one **Real-Time Decision Engine**, including newly created organizations. It is an agent-only service. Direct user chats, manual execution, voice chat and external chat-channel setup are blocked on the server and omitted from chat controls. Required hire approvals and organization/agent budgets still apply.

Executing agents receive its instructions in task context and organization context. The run-scoped MCP tools are `evaluate_decision` and `get_decision_evaluation`; HTTP equivalents are `/api/companies/{companyId}/decision-engine/evaluations` and `/api/companies/{companyId}/decision-engine/evaluations/{evaluationId}`. Only a verified, currently running, task-bound agent can call them. The caller supplies `purpose`, `state`, typed `questions`, and a stable `idempotencyKey`. The first call returns an asynchronous receipt; the second returns actual answers only once the worker succeeds. Cite that receipt and the result in the task/project's work. Evaluations do not approve or perform downstream actions.

Inputs are bound to the company, calling agent, task and responsible user. Identical concurrent requests share one durable receipt; changed input under that key is rejected. Ambiguous dispatch and provider outcomes are never automatically replayed. A receipt can recover its accepted wake/run after a restart. The normal worker validates its admission receipt before resolving the provider. Per-call questions and state override stale fixed agent settings.

The optional root-owned nonsecret file `WHOXOS_DECISION_ENGINE_PROVISIONING_FILE` (default `/var/lib/overview-labs/decision-engine-provisioning.json`) records the owner's explicit all-organization credential-sharing instruction: `sourceCompanyId`, `sourceSecretId`, `authorizedOwnerUserId`, and `scope: "all-organizations"`. Provisioning resolves the authorized source through the audited secret service, then creates a separate encrypted company secret. Existing organization keys take precedence; keys and secret references never travel with evaluation tool arguments or cross organization boundaries. Without an organization key or authorized provisioning policy, the engine is present but evaluations report missing setup.


## Evidence-based task decisions

Every current and future agent receives the decision-engine usage rules through its runtime organization context and tool description. This is request conditioning, not fine-tuning: TypeSafe does not offer customer-specific Jev weights ([model documentation](https://docs.typesafe.ai/models)).

Keep the decision narrow. Put verified facts, sources, constraints, computed numbers, contrary evidence and unknowns in state. Use short, distinct option labels and definitions, with an insufficient-evidence alternative where appropriate. Do not force a probability, do arithmetic with Jev, or treat a preference as authorization or a guarantee.

```json
{
  "idempotencyKey": "release-priority:evidence-v2",
  "purpose": "Choose a focus against the observed production release discrepancy",
  "taskReferences": ["TASK-98", "TASK-96"],
  "state": { "objective": "Resolve demonstrated source/deployment differences", "unknowns": ["Current deployed artifact hash needs rechecking"] },
  "questions": {
    "focus": {
      "type": "choice",
      "instructions": { "question": "Which focus addresses the observed release discrepancy?" },
      "criteria": {
        "reconcile": { "label": "Reconcile the release", "definition": "Address an observed source/deployment discrepancy", "taskReferences": ["TASK-98", "TASK-96"] },
        "unknown": { "label": "Gather missing evidence", "definition": "Use when the evidence does not establish a discrepancy" }
      }
    }
  }
}
```

The service authorizes each referenced task against the caller's actual task-read boundary, then supplies the complete task description, current nondeleted discussion and current document bodies to Jev in state. References may be UUIDs or organization-scoped task identifiers. Existing task identifiers in state, questions and options are recognized too. Only actual organization task prefixes are recognized automatically; model versions such as gpt-6 are not mistaken for tasks. Chat archives are excluded unless explicitly referenced through taskReferences or taskEvidence; the caller identity is included. Deleted comments and prior chat generations are excluded. Binary attachments, raw execution logs and external pages are not fetched: the calling agent must read permitted relevant evidence and include verified text/excerpts in state. Unavailable references fail before dispatch. Oversized evidence is not silently truncated. Jev's provider context limits still apply (currently 32k tokens for state plus the longest question and 64k total); choose relevant tasks and decompose oversized judgments ([limits](https://docs.typesafe.ai/models), [known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)).

Each evaluation records timestamps, complete-text counts and hashes for its immutable evidence snapshot. Identical uncertain retries retrieve the original receipt without collecting newer evidence or charging again. A genuinely new evidence version needs a new request key. Cards display concise labels with the platform's native task hyperlinks; full discussions remain in model state, not in option labels. Public links use the viewer's task-read permissions.

Validate decisions against labeled outcomes, test unknowns/contradictions and option ordering, and measure accuracy/calibration per task and model version before asserting reliability. Provider probabilities and confidence remain unchanged; no test pass is presented as proof of production readiness.

### Large task histories

The decision service applies a conservative **64 kB serialized context budget before dispatch**, separately from Jev's authoritative token limits. This byte budget is not an exact tokenizer. Complete histories can exceed the model limit even when fewer than twenty tasks are referenced. Such requests are rejected without creating a reservation or silently truncating text.

Read the current task evidence and select relevant comments and documents explicitly:

```json
{
  "taskEvidence": [
    { "task": "TASK-98", "commentIds": ["current-comment-uuid"], "documentKeys": ["plan", "result"] },
    { "task": "TASK-96", "commentIds": [], "documentKeys": ["result"] }
  ]
}
```

Use actual comment UUIDs and current document keys. An omitted selection includes all current evidence of that kind; an empty list includes none. Task descriptions and selected text bodies are complete. The immutable snapshot records selection IDs, excluded comment/document counts and source hashes. Preserve contrary evidence and unresolved blockers; do not select only favorable statements. Foreign, deleted or missing selections fail before dispatch. Chat archives are included only through explicit top-level `taskReferences` or `taskEvidence`, never incidental identifiers in a narrative.

The adapter recognizes TypeSafe's `max_tokens_exceeded` rejection and returns an actionable context-limit error, without echoing arbitrary provider response bodies. It never retries that rejected request automatically. Submit a genuinely new, smaller evidence version under a new key; preserve uncertain requests and their existing keys. Public cards expose safe error categories, concise tap-to-expand probability rows, optional choice sorting and native task links. Failed evaluations never display fabricated or stale probabilities.
