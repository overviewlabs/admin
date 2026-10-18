import { describe, expect, it } from "vitest";
import { sanitizeInheritedWHOXOSEnv } from "./server-utils.js";

describe("sanitizeInheritedWHOXOSEnv", () => {
  it("drops the host-only WHOXOS CLI command pointer", () => {
    expect(sanitizeInheritedWHOXOSEnv({
      WHOXOS_CMD: "node /missing/whoxos/dist/index.js",
      WHOXOS_RUNTIME_API_URL: "http://127.0.0.1:3100",
      PATH: "/usr/bin",
    })).toEqual({
      WHOXOS_RUNTIME_API_URL: "http://127.0.0.1:3100",
      PATH: "/usr/bin",
    });
  });
});
