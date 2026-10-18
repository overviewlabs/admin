import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { type Db, mobilePushDevices, mobilePushDeliveries } from "@whoxos/db";
import { logger } from "../middleware/logger.js";

export type MobilePushPayload = {title: string; body: string; url: string; tag: string};
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") && !u.hash && (
      u.hostname === "web.push.apple.com" || u.hostname.endsWith(".push.apple.com") ||
      u.hostname === "fcm.googleapis.com" || u.hostname === "updates.push.services.mozilla.com"
    );
  } catch { return false; }
}
export function activityPush(action: string, details: Record<string, unknown> = {}): string | null {
  if (["issue.comment_added", "issue.comment.created", "issue_comment_added", "issue_comment_created"].includes(action)) return "New agent message";
  if (action === "issue.updated") {
    const status = details.status ?? (details.changes as Record<string,unknown> | undefined)?.status;
    return ({done:"Task completed",blocked:"Task blocked",in_review:"Task ready for review",cancelled:"Task cancelled"} as Record<string,string>)[String(status)] ?? null;
  }
  if (["approval.created", "approval.requested"].includes(action)) return "Approval requested";
  if (/^approval\.(approved|rejected|revision_requested)$/.test(action)) return "Approval updated";
  if (/^(agent|heartbeat\.run)\.(error|failed)$/.test(action)) return "Agent needs attention";
  if (/^budget\.(hard_threshold_crossed|soft_threshold_crossed)$/.test(action)) return "Budget alert";
  if (action === "issue.thread_interaction_created") return "An agent needs your input";
  return null;
}
export function retryPush(status: number, attempts: number) {
  return attempts < 6 && (status === 0 || status === 408 || status === 429 || status >= 500);
}
type Keys = {publicKey: string; privateKey: string; subject: string; adminSecret: string};
function loadKeys(): Keys | null {
  const file = process.env.OVERVIEW_WEB_PUSH_KEY_FILE;
  if (!file) return null;
  const keys = JSON.parse(readFileSync(file,"utf8")) as Keys;
  if (!keys.publicKey || !keys.privateKey || !keys.adminSecret || !keys.subject?.startsWith("mailto:")) throw new Error("Invalid Web Push key configuration");
  return keys;
}
const services = new WeakMap<Db, ReturnType<typeof createMobilePushService>>();
export function mobilePushService(db: Db) {
  let service = services.get(db);
  if (!service) { service = createMobilePushService(db); services.set(db,service); }
  return service;
}
function createMobilePushService(db: Db) {
  const keys = loadKeys();
  const q = db.$client;
  const hashEndpoint = (s: string) => createHash("sha256").update(s).digest("hex");
  async function authorized(userId: string, companyId: string | null, personal = false) {
    if (personal) return (await q`select 1 from "user" where id=${userId} limit 1`).length > 0;
    const rows = await q`select 1 from "user" u where u.id=${userId} and (exists (select 1 from instance_user_roles r where r.user_id=u.id and r.role='instance_admin') or (${companyId}::uuid is not null and exists(select 1 from company_memberships m where m.principal_id=u.id and m.principal_type='user' and m.status='active' and m.company_id=${companyId}::uuid))) limit 1`;
    return rows.length > 0;
  }
  async function enqueue(deviceId: string, eventKey: string, payload: MobilePushPayload, companyId: string | null = null, status = "pending") {
    await db.insert(mobilePushDeliveries).values({deviceId,eventKey,payload,companyId,status}).onConflictDoNothing();
  }
  async function harvest() {
    // Recover from the durable activity log, including events while the app was closed.
    // A unique device/event key makes overlapping scans and restarts idempotent.
    const devices = await db.select().from(mobilePushDevices);
    for (const device of devices) {
      const events = await q`select a.id,a.action,a.details,a.entity_type,a.entity_id,a.company_id,c.name,c.issue_prefix from activity_log a join companies c on c.id=a.company_id where a.created_at >= ${device.createdAt.toISOString()} and a.created_at > now()-interval '24 hours' and (a.actor_type <> 'user' or a.actor_id <> ${device.userId}) and (a.action in ('issue.comment_added','issue.comment.created','issue_comment_added','issue_comment_created','issue.updated','issue.thread_interaction_created','approval.created','approval.requested','approval.approved','approval.rejected','approval.revision_requested','agent.error','agent.failed','heartbeat.run.error','heartbeat.run.failed','budget.hard_threshold_crossed','budget.soft_threshold_crossed')) and (exists(select 1 from company_memberships m where m.company_id=a.company_id and m.principal_id=${device.userId} and m.principal_type='user' and m.status='active') or exists(select 1 from instance_user_roles r where r.user_id=${device.userId} and r.role='instance_admin')) and not exists(select 1 from mobile_push_deliveries d where d.device_id=${device.id}::uuid and d.event_key=a.id::text) order by a.created_at,a.id limit 100`;
      for (const e of events) {
        const body = activityPush(e.action, e.details ?? {});
        const prefix = encodeURIComponent(e.issue_prefix || "");
        const url = e.entity_type === "issue" ? `/${prefix}/issues/${encodeURIComponent(e.entity_id)}` : `/${prefix}/inbox`;
        await enqueue(device.id,e.id,{title:`WHOXOS · ${e.name}`,body:body ?? "Activity updated",url,tag:`activity-${e.id}`},e.company_id,body ? "pending" : "skipped");
      }
      const failures = await q`select r.id,r.company_id,c.issue_prefix from heartbeat_runs r join companies c on c.id=r.company_id where r.status in ('failed','timed_out') and r.finished_at >= ${device.createdAt.toISOString()} and r.finished_at > now()-interval '24 hours' and (exists(select 1 from company_memberships m where m.company_id=r.company_id and m.principal_id=${device.userId} and m.principal_type='user' and m.status='active') or exists(select 1 from instance_user_roles u where u.user_id=${device.userId} and u.role='instance_admin')) and not exists(select 1 from mobile_push_deliveries d where d.device_id=${device.id}::uuid and d.event_key='run-'||r.id::text) order by r.finished_at limit 100`;
      for (const run of failures) await enqueue(device.id,`run-${run.id}`,{title:"WHOXOS",body:"An agent run needs attention.",url:`/${encodeURIComponent(run.issue_prefix)}/inbox`,tag:`run-${run.id}`},run.company_id);
    }
  }
  async function deliver() {
    if (!keys) return;
    // Lease rows atomically; an interrupted process releases work after two minutes.
    const jobs = await q`update mobile_push_deliveries set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' where id in (select id from mobile_push_deliveries where status in ('pending','sending') and next_attempt_at<=now() and created_at>now()-interval '24 hours' order by next_attempt_at limit 20 for update skip locked) returning *`;
    await Promise.all(jobs.map(async job => {
      const [device] = await db.select().from(mobilePushDevices).where(eq(mobilePushDevices.id,job.device_id));
      if (!device) return;
      if (!await authorized(device.userId,job.company_id,job.event_key.startsWith("test-"))) { await db.update(mobilePushDeliveries).set({status:"revoked"}).where(eq(mobilePushDeliveries.id,job.id)); return; }
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify(job.payload), {vapidDetails:keys,TTL:3600,urgency:"normal",timeout:10000});
        await db.update(mobilePushDeliveries).set({status:"sent",lastStatus:201}).where(eq(mobilePushDeliveries.id,job.id));
      } catch (error) {
        const status = Number((error as {statusCode?:number}).statusCode ?? 0);
        if (status === 404 || status === 410) { await db.delete(mobilePushDevices).where(eq(mobilePushDevices.id,device.id)); return; }
        await db.update(mobilePushDeliveries).set({status:retryPush(status,job.attempts) ? "pending" : "failed",lastStatus:status,nextAttemptAt:new Date(Date.now()+Math.min(3600000,15000*2**job.attempts))}).where(eq(mobilePushDeliveries.id,job.id));
        // Never log push endpoints, encryption keys, or notification contents.
        logger.warn({status,attempts:job.attempts},"Web Push delivery deferred or failed");
      }
    }));
  }
  let running = false;
  async function tick() {
    if (!keys || running) return;
    running = true;
    try { await harvest(); await deliver(); await q`delete from mobile_push_deliveries where created_at < now()-interval '2 days'`; }
    catch (error) { logger.warn({code:(error as {code?:string}).code ?? "unknown"},"Web Push queue unavailable; will retry"); }
    finally { running=false; }
  }
  if (keys) { const timer=setInterval(() => void tick(),3000);timer.unref(); }
  return {
    config: () => ({enabled:Boolean(keys),...(keys ? {publicKey:keys.publicKey}: {})}),
    hashEndpoint, enqueue, tick,
    async register(userId: string, subscription: {endpoint:string;keys:{auth:string;p256dh:string}}) {
      const endpointHash=hashEndpoint(subscription.endpoint);
      const [existing]=await db.select().from(mobilePushDevices).where(eq(mobilePushDevices.endpointHash,endpointHash));
      if (existing && existing.userId !== userId) {
        // Endpoint ownership cannot be transferred from another account without unsubscribing.
        throw new Error("This device subscription belongs to another account. Disable notifications before switching accounts.");
      }
      const count=await q`select count(*)::int as n from mobile_push_devices where user_id=${userId}`;
      if (!existing && count[0].n>=10) throw new Error("The ten-device notification limit has been reached.");
      const saved = await db.insert(mobilePushDevices).values({userId,endpointHash,subscription}).onConflictDoUpdate({target:mobilePushDevices.endpointHash,set:{subscription,updatedAt:new Date()},setWhere:eq(mobilePushDevices.userId,userId)}).returning({id:mobilePushDevices.id});
      if (!saved.length) throw new Error("This device belongs to another account. Disable notifications before switching accounts.");
    },
    async remove(userId:string, endpoint:string) { await db.delete(mobilePushDevices).where(and(eq(mobilePushDevices.userId,userId),eq(mobilePushDevices.endpointHash,hashEndpoint(endpoint)))); },
    async test(userId:string, endpoint:string) {
      const devices=await db.select().from(mobilePushDevices).where(and(eq(mobilePushDevices.userId,userId),eq(mobilePushDevices.endpointHash,hashEndpoint(endpoint))));
      if (!devices.length) throw new Error("Enable notifications on this device first.");
      for (const d of devices) await enqueue(d.id,`test-${Math.floor(Date.now()/30000)}`,{title:"WHOXOS",body:"Notifications are connected.",url:"/",tag:"overview-test"});
      void tick();
    },
    verifyAdminSecret(value:string) { if(!keys)return false; const a=Buffer.from(value),b=Buffer.from(keys.adminSecret);return a.length===b.length&&timingSafeEqual(a,b); },
    async adminEvent(userId:string,eventId:string,body:string,chatId?:string) {
      if (!await authorized(userId,null)) return;
      const devices=await db.select().from(mobilePushDevices).where(eq(mobilePushDevices.userId,userId));
      for (const d of devices) await enqueue(d.id,`admin-${eventId}`,{title:"WHOXOS · Admin",body,url:chatId ? `/OVE/admin?view=chat&chatId=${encodeURIComponent(chatId)}` : "/OVE/admin",tag:`admin-${eventId}`});
    },
  };
}
