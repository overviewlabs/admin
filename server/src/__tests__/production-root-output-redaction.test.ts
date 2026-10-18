import { describe, expect, it } from "vitest";
import { redactRootCommandOutput } from "../services/production-root.js";

describe("production root output boundary", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJydW5faWQiOiJmaXh0dXJlIn0.manufactured_signature";
  it("removes the current bearer even when printed naked in a syntax error", () => {
    expect(redactRootCommandOutput(`SyntaxError\n    request('${jwt}')`, `Bearer ${jwt}`))
      .toBe("SyntaxError\n    request('***REDACTED***')");
  });
  it("also strips JWT-shaped credentials from another run", () => {
    expect(redactRootCommandOutput(`unexpected output ${jwt}`, undefined)).toBe("unexpected output ***REDACTED***");
  });
  it("preserves ordinary status output", () => {
    expect(redactRootCommandOutput("uid=0(root)\n23 checks passed", "Bearer manufactured-test-token"))
      .toBe("uid=0(root)\n23 checks passed");
  });
  it("removes a non-JWT current bearer in every occurrence", () => {
    expect(redactRootCommandOutput("test-credential test-credential", "Bearer test-credential"))
      .toBe("***REDACTED*** ***REDACTED***");
  });
});
