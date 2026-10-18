import type { Agent } from "@whoxos/shared";
import { readVoiceSettings } from "@whoxos/shared/agent-voice";
import { Link } from "@/lib/router";
export function AgentVoice({agent}:{agent:Agent}) {
 const settings=readVoiceSettings(agent.metadata,agent.voiceName);
 return <div className="space-y-3"><h3 className="text-sm font-medium">Gemini voice</h3><p className="text-sm text-muted-foreground">Talk to {agent.name} using Gemini. Text chat continues to use the agent’s configured runtime. Voice actions use the organization’s existing tool permissions.</p><p className="text-sm text-muted-foreground">Voice model: {settings.model}</p><Link to="/apps/connect?source=gemini" className="text-sm underline">Connect Gemini</Link></div>;
}
