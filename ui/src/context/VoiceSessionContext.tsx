import { subscribeVoiceSessionReset } from "@/lib/active-voice-session";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useAccountIdentity } from "@/api/companies-query";
import { useCompany } from "./CompanyContext";
import { useLocation } from "react-router-dom";
import { useVoiceSession, type VoiceAgent } from "@/hooks/useVoiceSession";

type VoiceSessionValue = ReturnType<typeof useVoiceSession>;
const VoiceSessionContext = createContext<VoiceSessionValue | null>(null);

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const session = useVoiceSession();
  const { companies } = useCompany();
  const identity = useAccountIdentity();
  const { pathname } = useLocation();
  const account = useRef<string | null | undefined>(undefined);
  const reset = useRef(session.reset); reset.current = session.reset;
  useEffect(() => subscribeVoiceSessionReset(() => reset.current()), []);
  useEffect(() => {
    if (!identity.settled) return;
    if (account.current !== undefined && account.current !== identity.userId) reset.current();
    account.current = identity.userId;
  }, [identity.userId, identity.settled]);
  useEffect(() => {
    if (pathname === "/auth" || pathname.startsWith("/auth/")) {
      reset.current();
    }
  }, [pathname]);
  const start = async (agent: VoiceAgent) => {

    const company = companies.find(company => company.id === agent.companyId);
    await session.start({ ...agent, companyName: company?.name ?? agent.companyName, companyPrefix: company?.issuePrefix ?? agent.companyPrefix });
  };
  return <VoiceSessionContext.Provider value={{ ...session, start }}>{children}</VoiceSessionContext.Provider>;
}

export function useOptionalVoiceSession() { return useContext(VoiceSessionContext); }
