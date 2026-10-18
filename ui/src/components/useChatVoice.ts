import { useTheme } from "@/context/ThemeContext";
import { useOptionalVoiceSession } from "@/context/VoiceSessionContext";
import type { VoiceAgent } from "@/hooks/useVoiceSession";

/** A composer controls its own agent; viewing another chat never transfers voice. */
export function useChatVoice(agent?: VoiceAgent) {
  const session = useOptionalVoiceSession();
  const { theme } = useTheme();
  const matches = Boolean(agent && session?.agent?.id === agent.id && session.agent.companyId === agent.companyId);
  return {
    active: matches && Boolean(session?.active),
    stream: matches ? session?.stream ?? null : null,
    phase: session?.phase ?? "connecting",
    error: matches ? session?.error ?? "" : "",
    connectionRequired: matches && Boolean(session?.connectionRequired),
    start: async () => { if (agent) await session?.start(agent); },
    stop: () => { if (matches) session?.stop(); },
    theme,
  };
}
