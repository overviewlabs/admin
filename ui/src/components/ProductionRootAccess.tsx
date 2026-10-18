import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { ToggleSwitch } from "./ui/toggle-switch";
import { useToastActions } from "../context/ToastContext";

type RootAccess = { eligible: boolean; available: boolean; enabled: boolean; canManage: boolean; required?: boolean; target: "production" };
export function ProductionRootAccess({ companyId, agentId }: { companyId: string; agentId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const queryKey = ["production-root-access", companyId, agentId];
  const endpoint = `/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}/production-root`;
  const status = useQuery({ queryKey, queryFn: () => api.get<RootAccess>(endpoint), refetchOnWindowFocus: true });
  const update = useMutation({
    mutationFn: (enabled: boolean) => api.patch<RootAccess>(endpoint, { enabled }),
    onSuccess: result => {
      queryClient.setQueryData(queryKey, result);
      pushToast({ title: result.enabled ? "Production root access enabled" : "Production root access disabled", tone: "success" });
    },
    onError: error => {
      void queryClient.invalidateQueries({ queryKey });
      pushToast({ title: "Could not update root access", body: error instanceof Error ? error.message : "Try again", tone: "error" });
    },
  });
  if (!status.data?.eligible) return null;
  return <div className="flex items-center justify-between gap-4 text-sm">
    <div className="space-y-1">
      <div>Production root access</div>
      <p className="text-xs text-muted-foreground">
        {status.isPending ? "Checking the production executor…"
          : status.isError ? "Could not check production root access. Reload to try again."
          : !status.data?.available ? "The production executor needs a server administrator to connect it."
          : status.data.required ? "Enabled automatically for CEOs and top-level managers. They can grant or revoke host access for other agents in their organization."
          : !status.data.canManage ? "Only a server administrator who owns or administers this organization can change this."
          : "Lets this agent run root commands on the production server, affecting all hosted organizations. Turning this off blocks new commands and requests cancellation of running commands; completed changes remain."}
      </p>
    </div>
    <ToggleSwitch checked={status.data?.enabled === true}
      onCheckedChange={() => update.mutate(!status.data?.enabled)}
      disabled={status.data?.required || !status.data?.available || !status.data.canManage || status.isError || update.isPending} />
  </div>;
}
