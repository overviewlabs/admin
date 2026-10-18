import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { useNavigate } from "@/lib/router";
import { aiConnectionsApi } from "@/api/ai-connections";
import { AiConnectionCredentialStep } from "@/components/ai-connections/AiConnectionCredentialStep";
import { personalAiDefault } from "@/components/ai-connections/model";
import { Button } from "@/components/ui/button";

export function ConnectCodexPage() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const companyId = selectedCompany?.id ?? "";
  const accounts = useQuery({
    queryKey: ["ai-connections", companyId, "onboarding"],
    queryFn: () => aiConnectionsApi.list(companyId),
    enabled: Boolean(companyId),
  });
  const own = personalAiDefault(accounts.data?.connections ?? [], { companyId, provider: "openai" }, accounts.data?.currentUserId ?? "");
  const reconnect = own?.status !== "connected" ? own ?? accounts.data?.connections.find(account => account.provider === "openai" && account.ownership === "personal" && account.ownerUserId === accounts.data?.currentUserId && account.status !== "connected") : undefined;
  const connected = own?.status === "connected";
  return <section className="mx-auto flex w-full max-w-2xl flex-col gap-6" aria-label="Personal Codex setup">
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Link your Codex account first</h1>
      <p className="text-sm text-muted-foreground">Before sending work to {selectedCompany?.name ?? "the team"}, connect your own OpenAI account. Your requests use your account’s usage allowance. Other members connect their own accounts.</p>
    </div>
    {(error || accounts.error) && <p role="alert" className="text-sm text-destructive">{error ?? accounts.error?.message}</p>}
    {accounts.isPending ? <p role="status">Checking your connection…</p> : connected ? <>
      <p role="status" className="text-sm">Your Codex account is connected and selected for your team requests.</p>
      <Button onClick={() => navigate("/dashboard", { replace: true })}>Continue to team</Button>
    </> : accounts.error ? <Button variant="outline" onClick={() => void accounts.refetch()}>Retry connection check</Button> : companyId ? <>
      <AiConnectionCredentialStep
        companyId={companyId}
        provider="openai"
        initialMethod={reconnect?.method ?? "subscription"}
        connectionId={reconnect?.id}
        name={reconnect?.name ?? "My Codex account"}
        ownership="personal"
        agentIds={[]}
        allAgents={true}
        onCancel={() => setError("Link your personal account before continuing to the team.")}
        onComplete={async (result) => {
          if (saving) return;
          setSaving(true); setError(undefined);
          try {
            await aiConnectionsApi.setDefault(companyId, result.grantId);
            const verified = await accounts.refetch();
            if (!verified.data?.connections.some(account => account.grantId === result.grantId && account.isDefault && account.status === "connected" && account.ownerUserId === verified.data.currentUserId)) {
              throw new Error("Your connection is not ready yet. Check the account and try again.");
            }
            await client.invalidateQueries({ queryKey: ["ai-connections", companyId] });
          } catch (error) {
            setError(error instanceof Error ? error.message : "Could not finish linking your account.");
          } finally { setSaving(false); }
        }}
      />
      {saving && <p role="status">Verifying your personal connection…</p>}
    </> : <p role="status">Select your organization to connect.</p>}
  </section>;
}
