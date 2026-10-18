import { Router } from "express";
import { spawn } from "node:child_process";
import type { Db } from "@whoxos/db";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import { routineService } from "../services/routines.js";

const COMPANY = "6e796ff0-10ed-4c7d-bd6c-10c9386cd30a";
const SCRIPT = "/.WHOX/organizations/club-hql-6e796ff0/projects/source/leads_ui.py";
export function registryCall(payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Lead registry timed out")); }, 15_000);
    child.stdout.on("data", (chunk) => { output += chunk; if (output.length > 8_000_000) child.kill(); });
    child.stderr.resume();
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try { const result = JSON.parse(output); if (code !== 0) reject(new Error(result.error ?? "Registry unavailable")); else resolve(result); }
      catch { reject(new Error("Lead registry unavailable")); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
export function hqlLeadRoutes(db: Db) {
  const router = Router();
  const routines = routineService(db);
  router.use("/companies/:companyId/leads", (req, res, next) => {
    assertCompanyAccess(req, req.params.companyId as string);
    if (req.params.companyId !== COMPANY) { res.status(404).json({ error: "Leads is available in Club HQL" }); return; }
    next();
  });
  async function leadView(action: "list" | "pipeline") {
    const result = await registryCall({ action });
    const schedules = await routines.list(COMPANY);
    const enriched = await Promise.all(schedules.map(async (r: any) => {
      const triggers = (r.triggers ?? []).filter((t: any) => t.kind === "schedule" && t.enabled);
      const next = triggers.map((t: any) => t.nextRunAt).filter(Boolean).sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
      const last = r.lastRun ?? null;
      return { id: r.id, title: r.title, status: r.status,
        cron: triggers.map((t: any) => t.cronExpression).join("; "), timezone: triggers[0]?.timezone ?? "UTC",
        last_run_at: last?.triggeredAt ?? r.lastTriggeredAt ?? null, next_run_at: r.status === "active" ? next : null,
        last_status: r.activeIssue?.status ?? last?.linkedIssue?.status ?? last?.status ?? null,
        detail: last?.failureReason ?? null };
    }));
    const completed = schedules.map((r: any) => r.lastRun?.linkedIssue).filter((i: any) => i?.status === "done").map((i: any) => new Date(i.updatedAt).toISOString()).sort();
    const blocked = enriched.filter((r) => ["blocked","failed","error"].includes(r.last_status ?? ""));
    const active = enriched.filter((r) => r.status === "active");
    const researchStatus = result.research_status ? { ...result.research_status,
      last_success_at: completed.at(-1) ?? result.research_status.last_success_at ?? null,
      next_run_at: active.map((r) => r.next_run_at).filter(Boolean).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null,
    } : null;
    if (researchStatus && active.length && blocked.length) {
      researchStatus.status = "degraded";
      researchStatus.detail = `${blocked.length} research routines have blocked work; inspect the Automation view. Other enabled routines continue. Qualification standards remain enforced.`;
    }
    return { ...result, research_status: researchStatus, routines: enriched };
  }
  router.get("/companies/:companyId/leads", async (_req, res) => {
    res.json(await leadView("list"));
  });
  router.get("/companies/:companyId/leads/pipeline", async (_req, res) => {
    res.json(await leadView("pipeline"));
  });
  router.get("/companies/:companyId/leads/export.csv", async (req, res) => {
    assertBoard(req);
    const result = await registryCall({ action: "list" });
    const cell = (value: unknown) => {
      const raw = typeof value === "string" ? value : value == null ? "" : String(value);
      const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const headers = ["Lead ID","Company","City","State","Industry","Services","Contact","Title","Department","Phones","Emails","Contact source","Why now","Intent","Score","Ownership","Reviewed at","Sources","Unknowns","Outreach notes"];
    const rows = result.leads.map((l: any) => [l.id,l.company,l.facility?.city,l.facility?.state,l.industry,(l.services ?? []).join(" / "),l.contact?.name,l.contact?.title,l.contact?.department,[l.contact?.phone,...(l.contact?.phones ?? [])].filter(Boolean).join("; "),[l.contact?.email,...(l.contact?.emails ?? [])].filter(Boolean).join("; "),l.contact?.source_url,l.why_now,l.intent,l.score,l.ownership,l.reviewed_at,(l.evidence ?? []).map((e: any) => e.url).join("; "),(l.unknowns ?? []).join("; "),(l.notes ?? []).map((n: any) => `${n.created_at}: ${n.text}`).join(" | ")]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="club-hql-qualified-leads.csv"');
    res.send([headers,...rows].map((row) => row.map(cell).join(",")).join("\r\n"));
  });
  router.post("/companies/:companyId/leads/:leadId/notes", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) { res.status(403).json({ error: "Signed-in user required" }); return; }
    const { text, outcome, follow_up } = req.body ?? {};
    if (typeof text !== "string" || !text.trim() || text.length > 10_000 ||
        (outcome !== undefined && !["note","called","emailed","follow_up","connected","quoted","won","not_interested"].includes(outcome)) ||
        (follow_up && (typeof follow_up !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(follow_up)))) {
      res.status(400).json({ error: "Valid note, outcome and optional follow-up date required" }); return;
    }
    const leadId = req.params.leadId as string;
    if (!/^HQL-[a-f0-9]{12}$/.test(leadId)) { res.status(404).json({ error: "Lead not found" }); return; }
    let result;
    try { result = await registryCall({ action: "note", lead_id: leadId, author: req.actor.userId, text, outcome, follow_up }); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Cannot save note" }); return; }
    const actor = getActorInfo(req);
    await logActivity(db, { companyId: COMPANY, ...actor, action: "lead.outreach_note_added", entityType: "lead", entityId: leadId, details: { noteId: result.id, outcome: outcome ?? "note" } });
    res.status(201).json(result);
  });
  return router;
}
