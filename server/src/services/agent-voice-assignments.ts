import { and, asc, eq, ne, sql } from "drizzle-orm";
import { agents, companies, type Db } from "@whoxos/db";
import {
  MAX_AGENTS_PER_ORGANIZATION, readVoiceSettings,
  type VoiceName, type VoiceAssignments, type VoiceSettings, type VoiceSettingsUpdateResult,
} from "@whoxos/shared/agent-voice";
import { conflict, notFound } from "../errors.js";
import { logActivity, publishActivity, type ActivityPublication, type LogActivityInput } from "./activity-log.js";

type AssignmentUpdateOptions = {
  expectedCurrentVoice?: VoiceName | null;
  expectedVoiceOwnerId?: string | null;
  authorizeAgent: (agent: typeof agents.$inferSelect) => Promise<void>;
  actor: Pick<LogActivityInput, "actorType" | "actorId" | "agentId" | "runId">;
};

export function agentVoiceAssignmentService(db: Db) {
  return {
    async list(companyId: string): Promise<VoiceAssignments> {
      const rows = await db.select({ agentId: agents.id, agentName: agents.name, voice: agents.voiceName, status: agents.status })
        .from(agents).where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")))
        .orderBy(asc(agents.createdAt), asc(agents.id));
      return { capacity: MAX_AGENTS_PER_ORGANIZATION, assignments: rows.map(row => ({ ...row, voice: row.voice as VoiceName | null })) };
    },
    async update(companyId: string, agentId: string, settings: VoiceSettings, options: AssignmentUpdateOptions): Promise<VoiceSettingsUpdateResult> {
      const publications: ActivityPublication[] = [];
      const result = await db.transaction(async tx => {
        // Every swap/admission in an organization takes this lock before it
        // chooses a voice. The DB constraint and assignment trigger also cover
        // imports, direct metadata writes, and reactivations outside this path.
        const [company] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for("update");
        if (!company) throw notFound("Organization not found");
        const [agent] = await tx.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId))).for("update");
        if (!agent) throw notFound("Agent not found");
        await options.authorizeAgent(agent);
        if (agent.status === "terminated") throw conflict("Restore this agent before assigning a voice.");
        const requestedVoice = settings.profiles[settings.model].voice;
        const [owner] = await tx.select().from(agents).where(and(eq(agents.companyId, companyId), eq(agents.voiceName, requestedVoice))).for("update");
        if ((options.expectedCurrentVoice !== undefined && options.expectedCurrentVoice !== agent.voiceName)
          || (options.expectedVoiceOwnerId !== undefined && options.expectedVoiceOwnerId !== (owner?.id ?? null))) {
          throw conflict("Voice assignments changed. Review the current assignments and try again.", { code: "voice_assignment_changed" });
        }
        const swapping = owner && owner.id !== agent.id ? owner : null;
        if (swapping) await options.authorizeAgent(swapping);
        await tx.execute(sql`SET CONSTRAINTS agents_company_voice_uq DEFERRED`);
        const txDb = tx as unknown as Db;
        if (swapping) {
          // Only its canonical voice changes. The DB syncs both profile voice
          // fields while preserving this colleague's own delivery preferences.
          await tx.update(agents).set({ voiceName: agent.voiceName, updatedAt: new Date() }).where(eq(agents.id, swapping.id));
          await logActivity(txDb, { companyId, ...options.actor, action: "agent.voice.updated", entityType: "agent", entityId: swapping.id,
            details: { previousVoice: swapping.voiceName, voice: agent.voiceName, swappedWithAgentId: agent.id } }, publications);
        }
        const [updated] = await tx.update(agents).set({ voiceName: requestedVoice,
          metadata: sql`coalesce(${agents.metadata}, '{}'::jsonb) || ${JSON.stringify({ voice: settings })}::jsonb`, updatedAt: new Date(),
        }).where(eq(agents.id, agent.id)).returning();
        await logActivity(txDb, { companyId, ...options.actor, action: "agent.voice.updated", entityType: "agent", entityId: agent.id,
          details: { model: settings.model, enabled: settings.enabled, previousVoice: agent.voiceName, voice: requestedVoice,
            ...(swapping ? { swappedWithAgentId: swapping.id } : {}) } }, publications);
        return { ...readVoiceSettings(updated.metadata, updated.voiceName),
          ...(swapping ? { swappedWith: { agentId: swapping.id, agentName: swapping.name, voice: agent.voiceName as VoiceName | null } } : {}),
        };
      });
      for (const publication of publications) publishActivity(publication);
      return result;
    },
  };
}
