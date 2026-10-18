import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { issues, issueComments, type Db } from "@whoxos/db";
import type { SourceTrustMetadata } from "@whoxos/shared";
import { forbidden } from "../errors.js";
import { redactSensitiveText } from "../redaction.js";
import { accessService } from "./access.js";
import type { AuthorizationActor } from "./authorization.js";
import { isLowTrustQuarantined, sanitizeQuarantinedCommentForHigherTrust } from "./source-trust.js";

const TASK_LIMIT = 32;
export const VOICE_WORK_CONTEXT_MAX_BYTES = 20_000;
const COMMENT_READ_LIMIT = 8_000;

type RecordedComment = {
  body: string;
  createdAt: string;
  sourceTrust: SourceTrustMetadata | null;
};

function excerpt(value: string, limit: number) {
  const sanitized = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  return { text: sanitized.slice(0, limit), truncated: sanitized.length > limit };
}

/**
 * A small current work snapshot for voice turns, not a task history or host
 * health feed. The directory alone cannot ground questions about work status.
 * Read task detail only when BOTH the authenticated human and speaking agent
 * can read it. A company-wide list grant must not stand in for detail access.
 */
export async function loadVoiceWorkContext(
  db: Db,
  input: { companyId: string; agentId: string; boardActor: AuthorizationActor },
) {
  if (input.boardActor.type !== "board") throw forbidden("Voice work context requires an authenticated human.");
  const access = accessService(db);
  const actors: AuthorizationActor[] = [input.boardActor, { type: "agent", companyId: input.companyId, agentId: input.agentId }];
  // Project explicit fields and the last recorded update in one query. The
  // indexed correlated lookup never loads a whole thread, attachment, artifact,
  // adapter configuration or credential record. Avoid per-task canonical reads.
  const candidates = await db.select({
    id: issues.id, companyId: issues.companyId, identifier: issues.identifier,
    title: issues.title, status: issues.status, updatedAt: issues.updatedAt,
    projectId: issues.projectId, parentId: issues.parentId,
    assigneeAgentId: issues.assigneeAgentId, assigneeUserId: issues.assigneeUserId,
    hiddenAt: issues.hiddenAt, conversationAgentId: issues.conversationAgentId,
    sourceTrust: issues.sourceTrust,
    blockedAction: sql<string | null>`${issues.unblockDescriptor}->>'action'`,
    latestComment: sql<RecordedComment | null>`(
      select json_build_object(
        'body', left(voice_comment.body, ${COMMENT_READ_LIMIT}),
        'createdAt', voice_comment.created_at,
        'sourceTrust', voice_comment.source_trust
      ) from ${issueComments} as voice_comment
      where voice_comment.company_id = ${input.companyId}
        and voice_comment.issue_id = "issues"."id"
        and voice_comment.deleted_at is null
      order by voice_comment.created_at desc, voice_comment.id desc
      limit 1
    )`,
  }).from(issues).where(and(
    eq(issues.companyId, input.companyId), isNull(issues.conversationAgentId), isNull(issues.hiddenAt),
  )).orderBy(
    sql`case when ${issues.status} in ('done', 'cancelled') then 1 else 0 end`,
    desc(issues.updatedAt), desc(issues.id),
  ).limit(TASK_LIMIT + 1);

  const selected = candidates.slice(0, TASK_LIMIT).filter(row =>
    row.companyId === input.companyId && row.hiddenAt === null && row.conversationAgentId === null,
  );
  // Run the canonical authorization decision after collecting the bounded
  // content. No cached list permission or earlier-turn decision is reused.
  const visible = await Promise.all(selected.map(async row => {
    const scope = {
      issueId: row.id, projectId: row.projectId, parentIssueId: row.parentId,
      assigneeAgentId: row.assigneeAgentId, assigneeUserId: row.assigneeUserId,
    };
    return (await Promise.all(actors.map(actor => access.decide({
      actor, action: "issue:read", scope,
      resource: { type: "issue", companyId: input.companyId, ...scope, status: row.status },
    })))).every(decision => decision.allowed);
  }));
  const tasks = selected.filter((_, index) => visible[index]).map(row => {
    const last = row.latestComment && sanitizeQuarantinedCommentForHigherTrust(row.latestComment);
    const recorded = last && excerpt(last.body, 600);
    const blocked = row.status === "blocked" && row.blockedAction && !isLowTrustQuarantined(row.sourceTrust)
      ? excerpt(row.blockedAction, 350) : null;
    return {
      id: row.id, identifier: row.identifier, title: excerpt(row.title, 200).text,
      status: row.status, updatedAt: row.updatedAt.toISOString(),
      assigneeAgentId: row.assigneeAgentId, assigneeUserId: row.assigneeUserId,
      ...(blocked ? { recordedBlocker: blocked } : {}),
      ...(last && recorded ? { recordedUpdate: {
        source: "task_comment" as const, createdAt: last.createdAt, ...recorded,
        truncated: recorded.truncated || last.body.length >= COMMENT_READ_LIMIT,
      } } : {}),
    };
  });
  const result = {
    available: true as const,
    asOf: new Date().toISOString(),
    source: "overview_labs_task_records" as const,
    visibility: "permitted_task_details" as const,
    liveSystemHealth: false as const,
    limited: true as const,
    truncated: candidates.length > TASK_LIMIT,
    tasks,
  };
  // Reserve room for the existing human/agent directory in the per-turn 32 KB
  // context budget. Count UTF-8 bytes, including escaped JSON and multibyte text.
  while (result.tasks.length && Buffer.byteLength(JSON.stringify(result), "utf8") > VOICE_WORK_CONTEXT_MAX_BYTES) {
    result.tasks.pop();
    result.truncated = true;
  }
  return result;
}
