export type WHOXOSSemanticActionId =
  | "search_api"
  | "call_api"
  | "get_task_context"
  | "get_task_history"
  | "list_documents"
  | "read_document"
  | "list_document_revisions"
  | "report_progress"
  | "answer_status_question"
  | "write_document"
  | "request_human_input"
  | "register_deliverable"
  | "finish_task"
  | "block_task"
  | "request_review"
  | "list_agents"
  | "get_agent"
  | "search_tasks"
  | "list_approvals"
  | "get_approval"
  | "get_approval_context"
  | "get_workspace_runtime"
  | "control_workspace_service"
  | "set_dependencies"
  | "create_project"
  | "list_project_repositories"
  | "list_projects"
  | "create_task"
  | "request_approval"
  | "decide_approval"
  | "comment_on_approval"
  | "schedule_wake";

export type WHOXOSSemanticActionPlacement = "always" | "optional";
export type WHOXOSSemanticActionMode =
  "standard" | "ask" | "planning" | "skill_test";
export type WHOXOSSemanticActionEffect = "read" | "write" | "governance";

export type WHOXOSJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly WHOXOSJsonValue[]
  | { readonly [key: string]: WHOXOSJsonValue };

/** The JSON Schema subset used by the v1 semantic action catalog. */
export interface WHOXOSJsonSchema {
  readonly type?: string | readonly string[];
  readonly title?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, WHOXOSJsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | WHOXOSJsonSchema;
  readonly items?: WHOXOSJsonSchema;
  readonly enum?: readonly WHOXOSJsonValue[];
  readonly oneOf?: readonly WHOXOSJsonSchema[];
  readonly anyOf?: readonly WHOXOSJsonSchema[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly pattern?: string;
  readonly format?: string;
  readonly default?: WHOXOSJsonValue;
}

/**
 * A transport-neutral declaration. Catalog membership never grants discovery
 * or invocation authority; a run-scoped authorization layer must do that.
 */
export interface WHOXOSSemanticActionDescriptor {
  readonly schema: "whoxos.semantic-action.v1";
  readonly operationId: WHOXOSSemanticActionId;
  readonly version: 1;
  readonly title: string;
  readonly description: string;
  readonly placement: WHOXOSSemanticActionPlacement;
  readonly effect: WHOXOSSemanticActionEffect;
  readonly requiredClaims: readonly string[];
  readonly allowedModes: readonly WHOXOSSemanticActionMode[];
  readonly allowedRoles?: readonly string[];
  readonly inputSchema: WHOXOSJsonSchema;
  readonly outputSchema: WHOXOSJsonSchema;
}
