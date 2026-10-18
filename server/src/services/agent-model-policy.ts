import { unprocessable } from "../errors.js";

export const DEFAULT_AGENT_MODEL = "gpt-6.1-sol";
export const SECURITY_AGENT_MODEL = "gpt-6-sol";
export interface SecurityIdentity {
  name?: string | null;
  title?: string | null;
  role?: string | null;
  metadata?: Record<string, unknown> | null;
}
export function isSecurityAgent(agent: SecurityIdentity): boolean {
  return agent.role === "security" || agent.metadata?.organizationSecurity === true ||
    /\b(security|cybersecurity|appsec|incident response)\b/i.test(`${agent.name ?? ""} ${agent.title ?? ""}`);
}
export function securityTeamSize(company: { name: string; description?: string | null }, ordinaryAgentCount: number): number {
  if (ordinaryAgentCount >= 25) return 4;
  if (ordinaryAgentCount >= 10 || (ordinaryAgentCount >= 5 && /\b(treasury|finance|financial|trading|banking)\b/i.test(`${company.name} ${company.description ?? ""}`))) return 3;
  return 1;
}
export function applyAgentModelPolicy(agent: SecurityIdentity, adapterType: string, config: Record<string, unknown>): Record<string, unknown> {
  const security = isSecurityAgent(agent);
  const openai = adapterType === "codex_local" || (adapterType === "whoxos_runner" && (!config.provider || config.provider === "codex"));
  if (security && !openai) throw unprocessable("Security agents must use Codex with GPT-6 Sol and Daybreak.");
  if (security) return { ...config, model: SECURITY_AGENT_MODEL, ...(adapterType === "codex_local" ? { engine: "acp" } : { provider: "codex" }) };
  if (openai && !(typeof config.model === "string" && config.model.trim())) return { ...config, model: DEFAULT_AGENT_MODEL };
  return config;
}
