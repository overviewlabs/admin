import { heartbeatsApi } from "@/api/heartbeats";
import { issuesApi } from "@/api/issues";
import type { IssueComment } from "@whoxos/shared";
import { assertVoiceToolActive } from './voice-tool-call';
export function isVoiceComment(comment: Pick<IssueComment, "metadata">) {
  return comment.metadata?.sections?.some(section => section.rows.some(row => row.type === "text" && row.label === "Source" && row.text === "Voice conversation transcript"));
}
export function createVoiceAgentTools(issueId: string, generation: number, beforeSend: () => Promise<void>, receiptFor: (text: string, callId: string) => string | Promise<string>, identity?: { context: () => Promise<unknown>; authorizeTask: (fields: { id?: string; assigneeAgentId?: string | null; projectId?: string | null }) => Promise<unknown>; assertActive?: () => void; direct?: (name: string, args: Record<string, unknown>, callId: string, signal?: AbortSignal) => Promise<unknown> }) {
  async function progress() {
    const [issue, comments, interactions, runs] = await Promise.all([
      issuesApi.get(issueId), issuesApi.listComments(issueId, { order: "desc", limit: 50 }), issuesApi.listInteractions(issueId), heartbeatsApi.liveRunsForIssue(issueId),
    ]);
    if (issue.conversationSessionGeneration !== generation) throw new Error("The chat session changed. Restart voice before continuing.");
    const boundaryIndex = issue.conversationBoundaryCommentId ? comments.findIndex(comment => comment.id === issue.conversationBoundaryCommentId) : -1;
    let currentComments = boundaryIndex < 0 ? comments : comments.slice(0, boundaryIndex);
    if (issue.conversationBoundaryCommentId && boundaryIndex < 0) {
      // The reset marker may be outside this page or represented as a deleted
      // comment. Resolve its durable cursor instead of replaying an old session.
      const boundary = await issuesApi.getComment(issueId, issue.conversationBoundaryCommentId);
      const timestamp = new Date(boundary.createdAt).getTime();
      if (!Number.isFinite(timestamp)) throw new Error("Cannot verify the chat session boundary.");
      currentComments = comments.filter(comment => {
        const created = new Date(comment.createdAt).getTime();
        return created > timestamp || (created === timestamp && comment.id > boundary.id);
      });
    }
    return {
      status: issue.status, conversationState: issue.conversationState, executionRunId: issue.executionRunId ?? runs.find(run => run.status === "running")?.id ?? null,
      runs: runs.map(run => ({ id: run.id, agent: run.agentName, status: run.status, progress: run.currentStatusMessage })),
      replies: currentComments.filter(comment => comment.authorAgentId && !comment.deletedAt && !isVoiceComment(comment) && comment.body.trim() !== "/new").slice(0, 8).map(comment => ({ id: comment.id, text: comment.body.slice(0, 16000), updatedAt: comment.updatedAt })),
      questions: interactions.filter(item => item.status === "pending" && (item.kind === "ask_user_questions" || item.kind === "request_confirmation")),
    };
  }
  async function execute(name: string, args: Record<string, unknown>, callId: string, signal?: AbortSignal): Promise<unknown> {
    const assertActive = () => { assertVoiceToolActive(signal); identity?.assertActive?.(); };
    assertActive();
    if (name === "terminate_organization") {
      if (typeof args.organizationId !== "string" || typeof args.confirmationName !== "string" || !args.confirmationName.trim()) throw new Error("Specify the exact organization to delete. No deletion was attempted.");
      return execute("organization_api", { action: "terminate_organization", id: args.organizationId, data: JSON.stringify({ confirmationName: args.confirmationName }) }, callId, signal);
    }
    if (name === "get_agent_context") {
      if (!identity) throw new Error("Agent identity is unavailable. Restart voice.");
      return identity.context();
    }
    const publicResearch = name === "search_web" || name === "read_web_page"
      || (name === "organization_api" && (args.action === "search_web" || args.action === "read_web_page"));
    if (name === "get_organization_agents" || name === "organization_api" || name === "voice_workspace" || publicResearch) {
      // Public reads need no persisted chat input. The normal transcript drain
      // still saves speech; session and chat-generation checks remain mandatory.
      // Writes retain their existing ordered transcript barrier.
      if (!publicResearch) await beforeSend();
      assertActive();
      const chat = await (signal ? issuesApi.get(issueId, { signal }) : issuesApi.get(issueId));
      assertActive();
      if (chat.conversationSessionGeneration !== generation) throw new Error("The chat session changed. Restart voice.");
      if (!identity?.direct) throw new Error("Direct voice tools unavailable. Restart voice; no other model was started.");
      if (publicResearch) {
        // Only read-only research may abort an issued HTTP request. Mutations
        // retain their receipt and must not be retried when speech interrupts.
        const researchArgs = name === "organization_api" ? args : { action: name, data: JSON.stringify(args) };
        return identity.direct("organization_api", researchArgs, callId, signal);
      }
      if (name === "get_organization_agents") {
        const result = await identity.direct("organization_api", { action: "list_agents" }, callId);
        if (!Array.isArray(result) || result.some(agent => !agent || typeof agent.id !== "string" || typeof agent.name !== "string" || typeof agent.status !== "string")) {
          throw new Error("The organization roster returned an invalid response; the agent count could not be verified.");
        }
        if (result.length >= 100) throw new Error("The roster reached its result limit; the exact agent count could not be verified.");
        const current = result.filter(agent => agent.status !== "terminated");
        return {
          asOf: new Date().toISOString(), source: "WHOXOS agent roster", count: current.length,
          excludedTerminatedCount: result.length - current.length,
          agents: current.map(({ id, name, role, title, status }) => ({ id, name, role, title, status })),
        };
      }
      return identity.direct(name, args, callId);
    }
    if (name === "get_agent_progress") {
      const result = await progress(); assertActive(); return result;
    }
    if (name === "stop_agent_work") {
      const current = await progress();
      assertActive();
      if (!current.executionRunId) return { requested: false, state: "No active execution is attached to this chat." };
      await heartbeatsApi.cancel(current.executionRunId);
      return { requested: true, state: "Cancellation requested. Check progress before saying the agent has stopped." };
    }
    if (name === "send_agent_message" || name === "answer_agent_question") {
      throw new Error("Voice uses Gemini directly. This operation could launch another model and is disabled; use organization_api or voice_workspace.");
    }
    throw new Error("Unknown voice tool.");
  }
  return { execute, progress };
}
