import { AGENT_COMMUNICATION_STYLE_VERSION, AGENT_COMMUNICATION_STYLE, AGENT_VOICE_DELIVERY_STYLE } from "@whoxos/shared/agent-communication";
import { AGENT_ORGANIZATION_CONTEXT_GUIDANCE } from "@whoxos/shared/agent-organization-context";
import { AGENT_AUTONOMY_POLICY, AGENT_AUTONOMY_POLICY_VERSION } from "@whoxos/shared/agent-autonomy";
import { createHash } from "node:crypto";
import path from "node:path";
import { renderTemplate, readWHOXOSSkillSyncPreference } from "@whoxos/adapter-utils/server-utils";
import { readVoiceSettings } from "@whoxos/shared/agent-voice";
import { agentInstructionsService } from "./agent-instructions.js";
import { unprocessable } from "../errors.js";
import { WEB_RESEARCH_GUIDANCE } from "./web-research.js";

export type VoiceInstructionAgent = {
  id: string; companyId: string; name: string; role: string; title?: string | null;
  capabilities?: string | null; adapterType?: string; adapterConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  voiceName?: string | null;
};
export type VoiceInstructions = { revision: string; text: string; sources: string[] };

/** Read the same configured instruction bundle as the runtime; never a generated persona. */
export async function resolveVoiceInstructions(agent: VoiceInstructionAgent): Promise<VoiceInstructions> {
  const service = agentInstructionsService();
  const config = agent.adapterConfig ?? {};
  const bundle = await service.getBundle({ ...agent, adapterConfig: config });
  const sections: Array<{ source: string; content: string }> = [];
  let bytes = 0;
  const append = (source: string, content: string) => {
    bytes += Buffer.byteLength(content, "utf8");
    if (bytes > 128_000 || sections.length >= 32) throw unprocessable("Agent instructions exceed the voice context limit. Shorten the instruction bundle before starting voice.");
    sections.push({ source, content });
  };
  // File contents are passed verbatim, with only source labels added. Resolve
  // referenced Markdown within the configured bundle; never read arbitrary paths.
  if (bundle.rootPath) {
    if (!bundle.files.some(file => file.path === bundle.entryFile)) throw unprocessable("Cannot load this agent's configured instructions. Restore the instruction file before starting voice.");
    const pending = [bundle.entryFile];
    const visited = new Set<string>();
    while (pending.length) {
      const source = pending.shift()!;
      if (visited.has(source)) continue;
      visited.add(source);
      const file = bundle.files.find(file => file.path === source)!;
      if (file.size + bytes > 128_000) throw unprocessable("Agent instructions exceed the voice context limit.");
      const { content } = await service.readFile({ ...agent, adapterConfig: config }, source);
      append(source, content);
      for (const reference of bundle.files.filter(file => file.markdown && !file.virtual && !visited.has(file.path))) {
        const relative = path.posix.relative(path.posix.dirname(source), reference.path);
        const escaped = relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(?:^|[\\s\\x60("'/])${escaped}(?=$|[\\s\\x60)"'.,:;])`).test(content)) pending.push(reference.path);
      }
    }
  }
  // Legacy custom templates remain a runtime instruction source. Resolve only
  // safe identity variables; never make environment/adapter secrets available.
  const identity = { id: agent.id, companyId: agent.companyId, name: agent.name, role: agent.role, title: agent.title, capabilities: agent.capabilities };
  const data = { agentId: agent.id, companyId: agent.companyId, agent: identity, company: { id: agent.companyId }, context: { conversationMode: true } };
  for (const key of ["bootstrapPromptTemplate", "promptTemplate"] as const) {
    if (typeof config[key] === "string" && config[key].trim()) append(key, renderTemplate(config[key], data));
  }
  const text = sections.map(section => `--- Agent instruction source: ${section.source} ---\n${section.content}`).join("\n\n");
  const revision = createHash("sha256").update(JSON.stringify({ productionRootToolVersion: 1, identity, runtime: agent.adapterType, sections, communication: { version: AGENT_COMMUNICATION_STYLE_VERSION, text: AGENT_COMMUNICATION_STYLE, voice: AGENT_VOICE_DELIVERY_STYLE }, autonomy: { version: AGENT_AUTONOMY_POLICY_VERSION, text: AGENT_AUTONOMY_POLICY }, organizationGuidance: AGENT_ORGANIZATION_CONTEXT_GUIDANCE, webResearchGuidance: WEB_RESEARCH_GUIDANCE, skills: readWHOXOSSkillSyncPreference(config).desiredSkills, voice: readVoiceSettings(agent.metadata ?? null, agent.voiceName) })).digest("hex");
  return { revision, text, sources: sections.map(section => section.source) };
}
