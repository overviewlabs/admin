import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@whoxos/db";
import { assertBoardOrgAccess } from "./authz.js";
import { badRequest, unauthorized } from "../errors.js";
import { mobilePushService, validPushEndpoint } from "../services/mobile-push.js";
const subscriptionSchema=z.object({endpoint:z.string().max(2048).refine(validPushEndpoint,"Unsupported push service"),keys:z.object({auth:z.string().regex(/^[A-Za-z0-9_-]+$/).refine(v=>Buffer.from(v,"base64url").length===16),p256dh:z.string().regex(/^[A-Za-z0-9_-]+$/).refine(v=>Buffer.from(v,"base64url").length===65)})});
export function mobilePushRoutes(db:Db) {
  const router=Router();const service=mobilePushService(db);
  const user=(req:Request)=>{assertBoardOrgAccess(req);if(!req.actor.userId)throw unauthorized();return req.actor.userId;};
  router.get("/mobile-push/config",(req,res)=>{user(req);res.set("Cache-Control","no-store").json(service.config());});
  router.post("/mobile-push/subscriptions",async(req,res)=>{const id=user(req);if(!service.config().enabled)throw badRequest("Push is not configured");const parsed=subscriptionSchema.safeParse(req.body);if(!parsed.success)throw badRequest("Invalid push subscription");try{await service.register(id,parsed.data);}catch(e){throw badRequest((e as Error).message);}res.status(201).json({enabled:true});});
  router.post("/mobile-push/unsubscribe",async(req,res)=>{const id=user(req);const endpoint=z.string().max(2048).safeParse(req.body?.endpoint);if(!endpoint.success)throw badRequest("Invalid endpoint");await service.remove(id,endpoint.data);res.json({enabled:false});});
  router.post("/mobile-push/test",async(req,res)=>{const id=user(req);const endpoint=z.string().max(2048).safeParse(req.body?.endpoint);if(!endpoint.success)throw badRequest("Invalid endpoint");try{await service.test(id,endpoint.data);}catch(e){throw badRequest((e as Error).message);}res.status(202).json({queued:true});});
  return router;
}
// Private authenticated worker ingress, mounted outside browser mutation checks.
export function mobilePushAdminRoutes(db:Db) {
  const router=Router();const service=mobilePushService(db);
  router.post("/api/mobile-push/admin-event",async(req,res)=>{
    const address=req.socket.remoteAddress;
    if(!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(address??"")||!service.verifyAdminSecret(req.get("X-Overview-Push-Secret")??""))throw unauthorized();
    const data=z.object({userId:z.string().min(1).max(200),eventId:z.string().min(1).max(200),kind:z.enum(["reply","error","approval","scheduled","notification"]),chatId:z.string().uuid().optional()}).safeParse(req.body);
    if(!data.success)throw badRequest("Invalid Admin notification");
    const bodies={reply:"Your Admin response is ready.",error:"An Admin task needs attention.",approval:"Admin needs your input.",scheduled:"A scheduled Admin task has an update.",notification:"You have an Admin notification."};
    await service.adminEvent(data.data.userId,data.data.eventId,bodies[data.data.kind],data.data.chatId);res.status(202).json({queued:true});
  });return router;
}
