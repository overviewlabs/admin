import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Company } from "@whoxos/shared";
import { accessApi } from "../api/access";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { AgentSelect } from "./AgentMultiSelect";
import { ToggleSwitch } from "./ui/toggle-switch";

export function ExecutiveDelegationSettings({ company }: { company: Company }) {
  const client = useQueryClient();
  const [grant, setGrant] = useState(company.interactionResolverGovernance?.executiveDelegation);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  useEffect(() => {
    setGrant(company.interactionResolverGovernance?.executiveDelegation);
    setSelectedAgentId(company.interactionResolverGovernance?.executiveDelegation?.agentId ?? "");
  }, [company.interactionResolverGovernance?.executiveDelegation]);
  const session = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession(), retry: false });
  const userId = session.data?.user.id;
  const members = useQuery({
    queryKey: [...queryKeys.access.companyMembers(company.id), "executive-delegation", userId],
    queryFn: () => accessApi.listMembers(company.id), enabled: !!userId, retry: false,
  });
  // Membership, not instance-administrator access, grants this authority.
  const member = members.data?.members.find(row => row.companyId === company.id && row.principalType === "user" && row.principalId === userId);
  const canManage = !session.isError && !members.isError && member?.status === "active"
    && (member.membershipRole === "owner" || member.membershipRole === "admin");
  const agents = useQuery({ queryKey: queryKeys.agents.list(company.id), queryFn: () => agentsApi.list(company.id) });
  const eligible = (agents.data ?? []).filter(agent => agent.companyId === company.id && agent.role === "ceo"
    && ["idle", "running", "error"].includes(agent.status));
  const selected = selectedAgentId || grant?.agentId || (eligible.length === 1 ? eligible[0]!.id : "");
  const eligibleSelection = eligible.some(agent => agent.id === selected);
  const mutation = useMutation({
    mutationFn: (agentId: string | null) => {
      if (!canManage) throw new Error("Only an active organization owner or admin can change CEO delegation.");
      if (agentId && !eligible.some(agent => agent.id === agentId)) throw new Error("Select an available CEO in this organization.");
      return companiesApi.updateExecutiveDelegation(company.id, agentId);
    },
    onSuccess: updated => {
      setGrant(updated.interactionResolverGovernance?.executiveDelegation);
      if (updated.interactionResolverGovernance?.executiveDelegation) setSelectedAgentId(updated.interactionResolverGovernance.executiveDelegation.agentId);
      void client.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });
  const accessPending = session.isPending || (!!userId && members.isPending);
  return (
    <section className="max-w-2xl space-y-4" aria-labelledby="executive-delegation-title">
      <div id="executive-delegation-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Operational delegation</div>
      <div className="flex items-center justify-between gap-4">
        <label id="executive-delegation-label" className="text-sm" htmlFor="executive-delegation-toggle">Delegate operational decisions to CEO</label>
        <ToggleSwitch id="executive-delegation-toggle" aria-labelledby="executive-delegation-label" checked={!!grant}
          disabled={!canManage || mutation.isPending || (!grant && (!eligibleSelection || agents.isError))}
          onCheckedChange={enabled => mutation.mutate(enabled ? selected : null)} />
      </div>
      <p className="text-sm text-muted-foreground">
        Let the selected CEO resolve ordinary task questions and confirmations on your behalf. Decisions are recorded under the real agent identity in the audit log. You can revoke this at any time.
      </p>
      <p className="text-xs text-muted-foreground">
        Private personal requests, credentials, governed actions, and independent reviews remain outside this delegation.
      </p>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="executive-delegation-agent">CEO</label>
        <AgentSelect id="executive-delegation-agent" agents={eligible} value={selected} placeholder="Select an available CEO"
          emptyMessage="No available CEO in this organization." disabled={!canManage || mutation.isPending || agents.isPending || agents.isError}
          onChange={agentId => { if (grant) mutation.mutate(agentId); else setSelectedAgentId(agentId); }} />
      </div>
      {grant && <p className="text-xs text-muted-foreground" role="status">
        Delegated to {agents.data?.find(agent => agent.id === grant.agentId)?.name ?? "the selected CEO"}.
        {!eligible.some(agent => agent.id === grant.agentId) && " This CEO is currently unavailable; revoke delegation or select an available CEO."}
      </p>}
      {accessPending ? <p className="text-xs text-muted-foreground">Checking organization access…</p>
        : !canManage && <p className="text-xs text-muted-foreground">Only an active organization owner or admin can change this setting.</p>}
      {agents.isError && <p className="text-xs text-destructive" role="alert">Could not load the available CEOs. Refresh to try again.</p>}
      {mutation.isPending && <p className="text-xs text-muted-foreground" role="status">Saving delegation…</p>}
      {mutation.isError && <p className="text-xs text-destructive" role="alert">{mutation.error.message}</p>}
    </section>
  );
}
