import { describe, expect, it } from "vitest";
import { adminFileUrl, adminMessagePresentation, adminProgress, adminRuntimeActivity, adminThinking } from "./admin-chat-presentation";
import type { AdminMessage } from "../api/native-admin";
const message: AdminMessage = { id: "m", parent_id: null, role: "assistant", content: "", done: true, output: [] };
describe("Admin shared chat presentation", () => {
  it("binds generated files and rewrites their source links to authenticated downloads", () => {
    const result = adminMessagePresentation({ ...message, content: "[Report](sandbox:/tmp/report.txt)", output: [{ type: "file", id: "output", file_id: "file1", url: "/api/agent-files/file1", source_path: "/tmp/report.txt", name: "report.txt", content_type: "text/plain", size: 8 } as any] });
    expect(result.text).toBe("[Report](/admin-portal/api/agent-files/file1)");
    expect(result.attachments[0]).toMatchObject({ id: "file1", issueCommentId: "m", contentType: "text/plain", downloadPath: "/admin-portal/api/agent-files/file1?download=true" });
  });
  it("retains uploaded files and generated images even when no markdown links exist", () => {
    const result = adminMessagePresentation({ ...message, meta: { files: [{ id: "upload", url: "/api/files/upload.png", name: "input.png", type: "image/png" }] }, output: [{ type: "image", images: [{ id: "generated", url: "/api/agent-files/generated", name: "result.png", content_type: "image/png" }] }] });
    expect(result.attachments.map(a => a.originalFilename)).toEqual(["input.png", "result.png"]);
  });
  it("keeps raster previews bound to the durable image and original download",()=>{
    const preview="data:image/webp;base64,UklGRg==";
    const result=adminMessagePresentation({...message,content:"![Photo](sandbox:/tmp/photo.png)",output:[{type:"image",source_path:"/tmp/photo.png",images:[{id:"image1",url:"/api/agent-files/image1",name:"photo.png",content_type:"image/png",preview}]}]});
    expect(result.text).toBe("![Photo](/admin-portal/api/agent-files/image1)");
    expect(result.attachments[0]).toMatchObject({previewPath:preview,openPath:"/admin-portal/api/agent-files/image1",downloadPath:"/admin-portal/api/agent-files/image1?download=true"});
  });
  it.each(["data:image/svg+xml;base64,PHN2Zz4=","https://other.test/image.png","javascript:alert(1)","data:image/png;base64,"+"A".repeat(2_000_001)])("does not trust arbitrary preview content",preview=>{
    const result=adminMessagePresentation({...message,output:[{type:"image",images:[{id:"i",url:"/api/agent-files/i",content_type:"image/png",preview}]}]});
    expect(result.attachments[0].previewPath).toBeUndefined();
  });
  it.each(["https://evil.test/file", "//evil.test/file", "/api/files/../config", "/admin-portal/api/files/../../config", "/api/files/file?redirect=elsewhere"])("rejects untrusted attachment URLs %s", url => expect(adminFileUrl(url)).toBeUndefined());
  it("keeps progress separate from the final answer", () => {
    expect(adminProgress([{ type: "message", phase: "commentary", content: [{ text: "Checking the server." }] }, { type: "message", phase: "final_answer", content: [{ text: "Done." }] }])).toBe("Checking the server.");
  });
  it("shows observed preparation and retry stages only while they are active", () => {
    const preparation = { type: "activity", id: "context", content: "Preparing conversation history", status: "in_progress" };
    expect(adminRuntimeActivity([preparation])).toBe("Preparing conversation history");
    expect(adminRuntimeActivity([{ ...preparation, status: "completed" }])).toBeUndefined();
    expect(adminProgress([preparation])).toBe("");
    expect(adminRuntimeActivity([preparation, { ...preparation, id: "retry", content: "Reconnecting to the agent" }])).toBe("Reconnecting to the agent");
  });
  it("uses only provider supplied thinking text and stops its animation on completion", () => {
    expect(adminThinking({ type: "reasoning", summary: [{ text: "Checking files" }], status: "in_progress" }, message, 0)).toMatchObject({ kind: "thinking", lines: ["Checking files"], streaming: false });
  });
});
