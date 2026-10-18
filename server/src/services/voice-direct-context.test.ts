import express from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { voiceDirectMiddleware, voiceDirectPermit, isVoiceDirectExecution, isGeminiLiveOnly } from "./voice-direct-context.js";
it("requires a single-use server permit bound to the exact method and route", async () => {
  const app=express(); app.use(voiceDirectMiddleware); app.post('/api/tasks',async(_req,res)=>{await Promise.resolve();res.json({direct:isVoiceDirectExecution()});});
  expect((await request(app).post('/api/tasks')).body.direct).toBe(false);
  expect((await request(app).post('/api/tasks').set('x-overview-voice-direct','fake')).status).toBe(403);
  const permit=voiceDirectPermit('POST','/api/tasks');
  expect((await request(app).post('/api/tasks').set('x-overview-voice-direct',permit.token)).body.direct).toBe(true);
  expect((await request(app).post('/api/tasks').set('x-overview-voice-direct',permit.token)).status).toBe(403);
  expect(isVoiceDirectExecution()).toBe(false);
});
it("recognizes only an explicit persistent Gemini-only marker",()=>{
  expect(isGeminiLiveOnly({adapterConfig:{voiceExecutionOnly:true}})).toBe(true);
  expect(isGeminiLiveOnly({adapterConfig:{voiceExecutionOnly:'true'}})).toBe(false);
  expect(isGeminiLiveOnly(null)).toBe(false);
});
