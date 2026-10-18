import { describe, expect, it } from "vitest";
import { isTransientFailureStatusReply } from "./transient-failure-presentation.js";

describe("transient failure presentation", () => {
  it("keeps retryable provider status out of agent chat replies", () => {
    const error = "ACP agent reported a terminal service failure.";
    expect(isTransientFailureStatusReply({ failed: true, retryable: true, response: error, error })).toBe(true);
    expect(isTransientFailureStatusReply({ failed: true, retryable: true, response: "I saved the approved tasks.", error })).toBe(false);
    expect(isTransientFailureStatusReply({ failed: true, retryable: false, response: error, error })).toBe(false);
  });
});
