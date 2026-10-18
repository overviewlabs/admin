import { describe, it, expect } from "vitest";
import { activityPush, validPushEndpoint, retryPush } from "../services/mobile-push.js";
describe("mobile notification boundary", () => {
  it("accepts official push providers and rejects private or lookalike endpoints", () => {
    for(const url of ["https://web.push.apple.com/Qabc", "https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc"]) expect(validPushEndpoint(url)).toBe(true);
    for(const url of ["http://web.push.apple.com/a", "https://web.push.apple.com.evil.test/a", "https://127.0.0.1/a", "https://localhost/a", "https://web.push.apple.com:8443/a", "https://user:pass@web.push.apple.com/a", "file:///etc/passwd"]) expect(validPushEndpoint(url)).toBe(false);
  });
  it("classifies actual activity events without forwarding private message content", () => {
    expect(activityPush("issue.comment_added",{body:"private text"})).toBe("New agent message");
    expect(activityPush("issue.updated",{status:"blocked"})).toBe("Task blocked");
    expect(activityPush("issue.thread_interaction_created")).toBe("An agent needs your input");
    expect(activityPush("issue.read_marked")).toBe(null);
    expect(activityPush("issue.updated",{title:"Renamed"})).toBe(null);
  });
  it("retries transient failures with a finite bound and never retries revoked subscriptions", () => {
    for(const status of [0,408,429,500,503]) expect(retryPush(status,1)).toBe(true);
    for(const status of [400,401,403,404,410]) expect(retryPush(status,1)).toBe(false);
    expect(retryPush(503,6)).toBe(false);
  });
});
