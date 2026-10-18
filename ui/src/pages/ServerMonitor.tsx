import { useQuery } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useEffect, useState } from "react";
import { useAdminPortalAccess } from "../hooks/useAdminPortalAccess";
import { serverMonitorApi } from "../api/serverMonitor";
const bytes = (value: number) => `${(value / 1024 ** 3).toFixed(2)} GiB`;
export function ServerMonitor() {
  const { access, currentUserId } = useAdminPortalAccess();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Monitor" }]); }, [setBreadcrumbs]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("active");
  const allowed = access.data?.allowed === true;
  const query = useQuery({ queryKey: ["server-monitor", "instance", currentUserId], queryFn: () => serverMonitorApi.getInstance(), enabled: allowed, refetchInterval: 5000, refetchIntervalInBackground: false, retry: false });
  if (access.isError || access.data?.allowed === false) return <div className="p-6">Monitor is available to server administrators.</div>;
  if (!allowed) return null;
  const data = query.data;
  return <div className="p-6 space-y-6">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-xl font-semibold">Monitor</h1><p className="text-sm text-muted-foreground">Entire server · Refreshes every 5 seconds</p></div><button className="rounded-md border border-border px-3 py-2 text-sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh</button></div>
    {query.error && <p role="alert" className="text-destructive">{query.error.message} {data ? "Showing the last successful snapshot." : "Server administrator access is required."}</p>}
    {!data && query.isLoading && <p>Loading server metrics…</p>}
    {data && <>
      <p className="text-sm text-muted-foreground">{data.hostname} · {data.platform} · Updated {new Date(data.sampledAt).toLocaleTimeString()} · Uptime {Math.floor(data.uptimeSeconds / 86400)}d {Math.floor(data.uptimeSeconds / 3600) % 24}h</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[
        ["CPU", `${data.cpu.percent.toFixed(1)}%`, `${data.cpu.cores} cores`],
        ["Memory", bytes(data.memory.usedBytes), `${bytes(data.memory.availableBytes)} available / ${bytes(data.memory.totalBytes)} total`],
        ["Primary block storage", data.primaryDisk ? bytes(data.primaryDisk.usedBytes) : "Unavailable", data.primaryDisk ? `${bytes(data.primaryDisk.availableBytes)} available / ${bytes(data.primaryDisk.totalBytes)} total` : "Block volume is not mounted"],
        ["Load average", data.cpu.load.map(n => n.toFixed(2)).join(" / "), "1 / 5 / 15 minutes"],
      ].map(([title, value, detail]) => <div key={title} className="rounded-lg border border-border p-4 space-y-2"><h2 className="text-sm text-muted-foreground">{title}</h2><p className="text-xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div>)}</div>
      <section className="rounded-lg border border-border p-4 space-y-2"><h2 className="font-semibold">Storage</h2><p className="text-sm">Primary application volume · {data.primaryDisk?.mount ?? "Unavailable"} · Database, workspaces, uploads, and backups</p><p className="text-sm text-muted-foreground">Boot disk · Operating system · {data.disk ? `${bytes(data.disk.usedBytes)} used / ${bytes(data.disk.totalBytes)} total · ${bytes(data.disk.availableBytes)} available` : "Unavailable"}</p></section>
      {data.warnings.map(w => <p key={w} role="status" className="text-sm text-muted-foreground">{w}</p>)}
      <section className="space-y-3"><h2 className="font-semibold">Network · totals since interface started</h2>{data.network.map(n => <p className="text-sm" key={n.name}>{n.name} · Received {bytes(n.receivedBytes)} · Sent {bytes(n.transmittedBytes)}</p>)}</section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-semibold">Services</h2><input aria-label="Filter services" placeholder="Find a service…" value={filter} onChange={e => setFilter(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" /></div>
        <div className="flex flex-wrap gap-2">{["active", "failed", "inactive", "all"].map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-md border border-border px-3 py-2 text-sm ${status === value ? "bg-accent text-accent-foreground" : ""}`}>{value === "all" ? "All" : value === "active" ? "Active" : value === "failed" ? "Needs attention" : "Inactive"} ({data.services.filter(s => value === "all" || s.state === value).length})</button>)}</div>
        {data.services.some(s => s.state === "failed") && status !== "failed" && <button onClick={() => setStatus("failed")} className="text-sm text-destructive">{data.services.filter(s => s.state === "failed").length} failed services · View issues</button>}
        {["Application", "System"].map(scope => {
          const services = data.services.filter(s => s.scope === scope && (status === "all" || s.state === status) && s.name.toLowerCase().includes(filter.toLowerCase())).sort((a,b) => Number(b.state === "failed") - Number(a.state === "failed") || Number(b.subState === "running") - Number(a.subState === "running") || a.name.localeCompare(b.name));
          return <details key={scope} open className="rounded-lg border border-border">
            <summary className="cursor-pointer p-4 font-semibold">{scope === "Application" ? "WHOXOS applications" : "Server infrastructure"} ({services.length})</summary>
            <div role="region" aria-label={`${scope} services`} tabIndex={0} className="max-h-96 overflow-auto rounded-b-lg border-t border-border">
              <table className="w-full text-sm text-left">
                <caption className="sr-only">{scope} service status</caption>
                <thead className="sticky top-0 z-10 bg-background"><tr className="border-b border-border"><th scope="col" className="px-4 py-3 font-medium">Service</th><th scope="col" className="px-4 py-3 font-medium">Status</th><th scope="col" className="px-4 py-3 font-medium">Details</th></tr></thead>
                <tbody>{services.map(s => <tr key={s.name} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                  <th scope="row" className="px-4 py-3 font-normal whitespace-nowrap">{s.name.replace(/\.service$/, "")}</th>
                  <td className={`px-4 py-3 whitespace-nowrap ${s.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{s.state === "active" ? "Active" : s.state === "failed" ? "Failed" : s.state === "inactive" ? "Inactive" : s.state}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{s.subState === "running" ? "Running" : s.state === "active" && s.subState === "exited" ? "Completed · one-shot service" : s.subState === "dead" ? "Stopped" : s.subState}</td>
                </tr>)}{services.length === 0 && <tr><td colSpan={3} className="px-4 py-3 text-muted-foreground">No matching services.</td></tr>}</tbody>
              </table>
            </div>
          </details>;
        })}
      </section>
    </>}
  </div>;
}
