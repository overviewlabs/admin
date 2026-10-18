import { expect, it } from "vitest";
import { compactVoiceTurnContext } from "./voice-compact-context";
it("keeps all identities, roles, access guidance and authoritative task states", () => {
 const original = { currentHuman: {role:"owner"}, dataAccess:{scope:"permitted only"}, agents:[{id:"a",name:"CEO",role:"ceo",capabilities:"Long prose"}], work:{truncated:false,tasks:[{id:"t",status:"blocked",recordedBlocker:{text:"Need data"},recordedUpdate:{text:"x".repeat(600),truncated:false,source:"task_comment"}}]} };
 const result = compactVoiceTurnContext(original) as typeof original;
 expect(result.agents).toEqual([{id:"a",name:"CEO",role:"ceo"}]);
 expect(result.currentHuman).toEqual(original.currentHuman);
 expect(result.dataAccess).toEqual(original.dataAccess);
 expect(result.work.tasks[0].recordedBlocker).toEqual(original.work.tasks[0].recordedBlocker);
 expect(result.work.tasks[0].status).toBe("blocked");
 expect(result.work.tasks[0].recordedUpdate).toMatchObject({text:"x".repeat(160),truncated:true,source:"task_comment"});
 expect(original.work.tasks[0].recordedUpdate.text).toHaveLength(600);
});
it("never turns an unavailable snapshot into available data", () => {
 expect(compactVoiceTurnContext({available:false})).toMatchObject({available:false});
 expect(compactVoiceTurnContext(null)).toBe(null);
});
it("retains short updates and existing truncation flags", () => {
 const work={truncated:true,tasks:[{recordedUpdate:{text:"Complete",truncated:true}}]};
 expect(compactVoiceTurnContext({work})).toMatchObject({work});
});
