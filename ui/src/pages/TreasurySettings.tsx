import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TREASURY_COMPANY_ID, treasuryLimitsSchema, type TreasurySettings as Settings } from "@whoxos/shared";
import { authApi } from "../api/auth";
import { treasuryApi } from "../api/treasury";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";

function PersonalLimits({ settings, saved }: { settings: Settings; saved: (next: Settings) => void }) {
  const [capital, setCapital] = useState(settings.limits ? (settings.limits.totalCapitalCents / 100).toFixed(2) : "");
  const [trade, setTrade] = useState(settings.limits ? (settings.limits.maximumTradeCents / 100).toFixed(2) : "");
  const [loss, setLoss] = useState(settings.limits ? (settings.limits.dailyLossLimitCents / 100).toFixed(2) : "");
  const [symbols, setSymbols] = useState(settings.limits?.permittedSymbols.join(", ") ?? "");
  const [equity, setEquity] = useState(settings.limits?.permittedAssetClasses.includes("equity") ?? false);
  const [option, setOption] = useState(settings.limits?.permittedAssetClasses.includes("option") ?? false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: (limits: NonNullable<Settings["limits"]>) => treasuryApi.save(settings.companyId, limits, settings.revision),
    onSuccess: (next) => { saved(next); }, onError: (err: Error) => setError(err.message) });
  function cents(value: string) { return /^\d+(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : NaN; }
  function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = treasuryLimitsSchema.safeParse({ currency: "USD", totalCapitalCents: cents(capital), maximumTradeCents: cents(trade),
      dailyLossLimitCents: cents(loss), permittedAssetClasses: [...(equity ? ["equity"] : []), ...(option ? ["option"] : [])],
      permittedSymbols: symbols.split(/[\s,]+/).filter(Boolean) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your limits"); return; }
    mutation.mutate(parsed.data);
  }
  return <form onSubmit={submit} className="flex flex-col gap-6">
    <div className="grid gap-4 md:grid-cols-3">
      {([ ["capital", "Total capital allocation (USD)", capital, setCapital], ["trade", "Maximum exposure per trade (USD)", trade, setTrade],
        ["loss", "Daily loss limit (USD)", loss, setLoss] ] as const).map(([id, label, value, change]) =>
        <div key={id} className="flex flex-col gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} type="text" inputMode="decimal"
          required value={value} onChange={(event) => { change(event.target.value); }} disabled={mutation.isPending} /></div>)}
    </div>
    <fieldset className="flex flex-col gap-3" disabled={mutation.isPending}>
      <legend className="text-sm font-medium">Permitted instruments</legend>
      <Label className="flex items-center gap-2"><input type="checkbox" checked={equity} onChange={(event) => { setEquity(event.target.checked); }} /> Stocks / equities</Label>
      <Label className="flex items-center gap-2"><input type="checkbox" checked={option} onChange={(event) => { setOption(event.target.checked); }} /> Options</Label>
    </fieldset>
    <div className="flex flex-col gap-2"><Label htmlFor="symbols">Permitted symbols</Label><Input id="symbols" required value={symbols}
      onChange={(event) => { setSymbols(event.target.value); }} disabled={mutation.isPending} />
      <p className="text-sm text-muted-foreground">Enter the symbols you allow, separated by commas. Other symbols are blocked.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save my limits"}</Button></div>
  </form>;
}

export function TreasurySettings() {
  const [savedNotice, setSavedNotice] = useState(false);
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const client = useQueryClient();
  const session = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession(), retry: false });
  const userId = session.data?.user.id;
  useEffect(() => { setSavedNotice(false); }, [userId, selectedCompanyId]);
  const key = ["treasury-settings", selectedCompanyId, userId];
  const settings = useQuery({ queryKey: key, queryFn: () => treasuryApi.settings(selectedCompanyId!), retry: false,
    enabled: selectedCompanyId === TREASURY_COMPANY_ID && !!userId, refetchOnWindowFocus: false });
  useEffect(() => { setBreadcrumbs([{ label: "My trading settings" }]); }, [setBreadcrumbs]);
  if (selectedCompanyId !== TREASURY_COMPANY_ID) return <p className="p-6">Select Treasury to manage your trading settings.</p>;
  return <div className="flex flex-col gap-6 p-6">
    <div className="flex flex-col gap-2"><h1 className="text-2xl font-semibold">My trading settings</h1>
      <p className="text-muted-foreground">Choose your own limits. These apply to your account, independently of other Treasury users.</p></div>
    <Card className="flex flex-col gap-3 p-6"><p className="font-medium">Live trading is unavailable</p>
      <p className="text-sm text-muted-foreground">Saving limits does not enable trading. Broker verification and independent approval are still required.
        The current workflow uses your capital, per-trade and instrument limits for research decisions. Your daily loss limit is saved for the future live workflow.</p>
      <p className="text-sm text-muted-foreground">Agents cannot change your settings. Changing them requires existing decisions to be reviewed again.</p></Card>
    <Card className="p-6">{settings.error || session.error ? <p role="alert" className="text-destructive">{(settings.error ?? session.error)?.message}</p>
      : settings.data && settings.data.userId === userId ? <PersonalLimits key={`${userId}:${settings.data.revision ?? "unset"}`} settings={settings.data}
          saved={(next) => { client.setQueryData(key, next); setSavedNotice(true); }} />
      : session.isPending || settings.isPending ? <p>Loading your settings…</p> : <p>Sign in to configure your personal limits.</p>}</Card>
    {savedNotice && <p role="status" className="text-sm">Your limits are saved. Live trading remains unavailable.</p>}
  </div>;
}
