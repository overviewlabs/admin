import { describe, expect, it } from "vitest";
import {
  getCloudStackContext,
  isCloudManagedInstance,
  type CloudInstanceEnv,
} from "../services/cloud-instance.js";

describe("isCloudManagedInstance", () => {
  it("unifies both prior signals without weakening either restrictive floor", () => {
    const cases: CloudInstanceEnv[] = [
      {},
      { WHOXOS_CLOUD_TENANT_SERVER_TOKEN: "tenant-token" },
      { WHOXOS_MANAGED_CONFIG: "" },
      {
        WHOXOS_CLOUD_TENANT_SERVER_TOKEN: "tenant-token",
        WHOXOS_MANAGED_CONFIG: "managed-document",
      },
    ];

    for (const env of cases) {
      const priorTokenFloor = Boolean(env.WHOXOS_CLOUD_TENANT_SERVER_TOKEN?.trim());
      const priorManagedConfigFloor = env.WHOXOS_MANAGED_CONFIG !== undefined;
      const canonicalFloor = isCloudManagedInstance(env);

      expect(canonicalFloor).toBe(priorTokenFloor || priorManagedConfigFloor);
      expect(canonicalFloor || !priorTokenFloor).toBe(true);
      expect(canonicalFloor || !priorManagedConfigFloor).toBe(true);
    }
  });

  it("does not treat a blank tenant token alone as a managed signal", () => {
    expect(isCloudManagedInstance({ WHOXOS_CLOUD_TENANT_SERVER_TOKEN: "   " })).toBe(false);
  });
});

describe("getCloudStackContext", () => {
  it("returns null outside WHOXOS Cloud even when stray stack metadata exists", () => {
    expect(getCloudStackContext({ WHOXOS_STACK_SLUG: "stray-stack" })).toBeNull();
  });

  it("returns normalized provisioner metadata for cloud instances", () => {
    expect(getCloudStackContext({
      WHOXOS_CLOUD_TENANT_SERVER_TOKEN: "tenant-token",
      WHOXOS_CLOUD_STACK_ID: " stack-1 ",
      WHOXOS_STACK_SLUG: " acme ",
      WHOXOS_CLOUD_ACCOUNT_GROUP_ID: " account-group-1 ",
      WHOXOS_PRIMARY_HOST: " acme.whoxos.app ",
      WHOXOS_CLOUD_API_ORIGIN: " https://app.whoxos.app ",
    })).toEqual({
      stackId: "stack-1",
      stackSlug: "acme",
      accountGroupId: "account-group-1",
      primaryHost: "acme.whoxos.app",
      cloudOrigin: "https://app.whoxos.app",
    });
  });

  it("represents missing managed metadata explicitly without failing health checks", () => {
    expect(getCloudStackContext({ WHOXOS_MANAGED_CONFIG: "managed-document" })).toEqual({
      stackId: null,
      stackSlug: null,
      accountGroupId: null,
      primaryHost: null,
      cloudOrigin: null,
    });
  });
});
