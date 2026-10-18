import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeWHOXOSCloudConnectorEnrollment,
  loadWHOXOSCloudConnectorIdentity,
  whoxosCloudConnectorEnrollmentStatus,
  whoxosCloudConnectorIdentityPath,
  startWHOXOSCloudConnectorEnrollment,
} from "./whoxos-cloud-connector-enrollment.js";
import { whoxosCloudConnectorConfigFromEnv } from "./whoxos-cloud-connector.js";
import { reconcileWHOXOSCloudConnectorEnrollmentStatus } from "./whoxos-cloud-connector-status.js";

describe("WHOXOS Cloud self-host enrollment", () => {
  let root = "";
  let previousHome: string | undefined;
  let previousInstance: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "whoxos-cloud-connector-"));
    previousHome = process.env.WHOXOS_HOME;
    previousInstance = process.env.WHOXOS_INSTANCE_ID;
    process.env.WHOXOS_HOME = root;
    process.env.WHOXOS_INSTANCE_ID = "connector-test";
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.WHOXOS_HOME;
    else process.env.WHOXOS_HOME = previousHome;
    if (previousInstance === undefined) delete process.env.WHOXOS_INSTANCE_ID;
    else process.env.WHOXOS_INSTANCE_ID = previousInstance;
    rmSync(root, { recursive: true, force: true });
  });

  it("keeps private keys owner-only and activates only the matching one-time callback", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url, body });
      if (url.endsWith("/v1/connector/enrollments")) {
        return Response.json({
          enrollmentId: "enroll-test",
          verificationUrl: "https://my.example.test/connections/enroll?id=enroll-test",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }, { status: 201 });
      }
      const token = String(body.request);
      const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
      expect(claims).toMatchObject({
        iss: loadWHOXOSCloudConnectorIdentity()?.instanceId,
        aud: "https://my.example.test/v1/connector/enrollment-claims",
        env: "development",
        op: "enroll",
      });
      expect(typeof claims.ah).toBe("string");
      return Response.json({
        id: loadWHOXOSCloudConnectorIdentity()?.instanceId,
        environment: "development",
        origins: ["https://private.example.test"],
      });
    });

    const pending = await startWHOXOSCloudConnectorEnrollment({
      origin: "https://private.example.test",
      env: {
        WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my.example.test",
        WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "development",
      },
      request: request as typeof fetch,
    });
    expect(pending.status).toBe("pending");
    expect(pending.verificationUrl).toBe("https://my.example.test/connections/enroll?id=enroll-test");
    expect(statSync(path.dirname(whoxosCloudConnectorIdentityPath())).mode & 0o777).toBe(0o700);
    expect(statSync(whoxosCloudConnectorIdentityPath()).mode & 0o777).toBe(0o600);
    expect(readFileSync(whoxosCloudConnectorIdentityPath(), "utf8")).not.toContain("approval-code");

    await expect(completeWHOXOSCloudConnectorEnrollment({
      enrollmentId: "enroll-test",
      approvalCode: "approval-code",
      state: "wrong-state",
      request: request as typeof fetch,
    })).rejects.toThrow(/Invalid or expired/);

    const state = loadWHOXOSCloudConnectorIdentity()?.pending?.returnState;
    const active = await completeWHOXOSCloudConnectorEnrollment({
      enrollmentId: "enroll-test",
      approvalCode: "approval-code",
      state: state!,
      request: request as typeof fetch,
    });
    expect(active).toMatchObject({ configured: true, status: "active", origins: ["https://private.example.test"] });
    const config = whoxosCloudConnectorConfigFromEnv({});
    expect(config).toMatchObject({ baseUrl: "https://my.example.test", environment: "development" });
    expect(requests).toHaveLength(2);

    const statusRequest = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("https://my.example.test/v1/connector/instance-status");
      return Response.json({ active: false, status: "suspended" });
    });
    await expect(reconcileWHOXOSCloudConnectorEnrollmentStatus({}, statusRequest as typeof fetch)).resolves.toMatchObject({
      configured: false,
      status: "suspended",
      instanceId: active.instanceId,
    });
  });

  it("rejects non-loopback plain HTTP destinations before creating keys", async () => {
    await expect(startWHOXOSCloudConnectorEnrollment({
      origin: "http://private.example.test",
      request: vi.fn() as typeof fetch,
    })).rejects.toThrow(/requires HTTPS/);
    expect(whoxosCloudConnectorEnrollmentStatus().status).toBe("not_configured");
  });

  it.each([
    "https://my.example.test/connections/enroll?id=another-enrollment",
    "https://my.example.test/connections/enroll",
    "https://my.example.test/connections/enroll?id=enroll-test&next=%2Faccount",
    "https://my.example.test/connections/enroll?id=enroll-test#fragment",
    "https://user@my.example.test/connections/enroll?id=enroll-test",
  ])("rejects an imprecise broker verification destination: %s", async (verificationUrl) => {
    await expect(startWHOXOSCloudConnectorEnrollment({
      origin: "https://private.example.test",
      env: {
        WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my.example.test",
        WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "development",
      },
      request: vi.fn(async () => Response.json({
        enrollmentId: "enroll-test",
        verificationUrl,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, { status: 201 })) as typeof fetch,
    })).rejects.toThrow(/invalid enrollment destination/);
  });

  it("serializes overlapping starts and reuses one unexpired enrollment", async () => {
    let releaseBroker!: () => void;
    const brokerMayRespond = new Promise<void>((resolve) => {
      releaseBroker = resolve;
    });
    const request = vi.fn(async () => {
      await brokerMayRespond;
      return Response.json({
        enrollmentId: "enroll-shared",
        verificationUrl: "https://my.example.test/connections/enroll?id=enroll-shared",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, { status: 201 });
    });
    const values = {
      origin: "https://private.example.test",
      companyId: "company-test",
      initiatedBy: "user:admin-test",
      env: {
        WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my.example.test",
        WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "development",
      },
      request: request as typeof fetch,
    };

    const first = startWHOXOSCloudConnectorEnrollment(values);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    const second = startWHOXOSCloudConnectorEnrollment(values);
    releaseBroker();

    const [firstStatus, secondStatus] = await Promise.all([first, second]);
    expect(request).toHaveBeenCalledOnce();
    expect(firstStatus).toMatchObject({ status: "pending", verificationUrl: expect.stringContaining("enroll-shared") });
    expect(secondStatus).toEqual(firstStatus);
    expect(loadWHOXOSCloudConnectorIdentity()?.pending).toMatchObject({
      enrollmentId: "enroll-shared",
      companyId: "company-test",
      initiatedBy: "user:admin-test",
    });
    await expect(startWHOXOSCloudConnectorEnrollment({
      ...values,
      initiatedBy: "user:another-admin",
    })).rejects.toThrow(/another administrator/);
    await expect(startWHOXOSCloudConnectorEnrollment({
      ...values,
      companyId: "another-company",
    })).rejects.toThrow(/another company/);
    expect(request).toHaveBeenCalledOnce();
  });

  it("defaults an enrollment to the environment of the standard Cloud broker", () => {
    expect(whoxosCloudConnectorEnrollmentStatus({})).toMatchObject({
      brokerBaseUrl: "https://my.whoxos.app",
      environment: "production",
    });
    expect(whoxosCloudConnectorEnrollmentStatus({
      WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app",
    })).toMatchObject({ environment: "staging" });
  });

  it("rotates a non-active identity instead of mixing enrollment targets", async () => {
    const origin = "https://private.example.test";
    const productionRequest = vi.fn(async () => Response.json({
      enrollmentId: "enroll-production",
      verificationUrl: "https://my.whoxos.app/connections/enroll?id=enroll-production",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, { status: 201 }));
    await startWHOXOSCloudConnectorEnrollment({
      origin,
      env: { WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my.whoxos.app" },
      request: productionRequest as typeof fetch,
    });
    const productionIdentity = loadWHOXOSCloudConnectorIdentity()!;

    expect(whoxosCloudConnectorEnrollmentStatus({
      WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app",
    })).toEqual({
      configured: false,
      status: "unverified",
      brokerBaseUrl: "https://my-staging.whoxos.app",
      instanceId: null,
      environment: "staging",
      origins: [],
    });

    const stagingRequest = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://my-staging.whoxos.app/v1/connector/enrollments");
      expect(JSON.parse(String(init?.body))).toMatchObject({ environment: "staging", origin });
      return Response.json({
        enrollmentId: "enroll-staging",
        verificationUrl: "https://my-staging.whoxos.app/connections/enroll?id=enroll-staging",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, { status: 201 });
    });
    const stagingStatus = await startWHOXOSCloudConnectorEnrollment({
      origin,
      env: { WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app" },
      request: stagingRequest as typeof fetch,
    });
    const stagingIdentity = loadWHOXOSCloudConnectorIdentity()!;

    expect(stagingStatus).toMatchObject({
      status: "pending",
      brokerBaseUrl: "https://my-staging.whoxos.app",
      environment: "staging",
      verificationUrl: "https://my-staging.whoxos.app/connections/enroll?id=enroll-staging",
    });
    expect(stagingIdentity.instanceId).not.toBe(productionIdentity.instanceId);
    expect(stagingIdentity.signPublicKey).not.toBe(productionIdentity.signPublicKey);
    expect(stagingIdentity.sealPublicKey).not.toBe(productionIdentity.sealPublicKey);
    expect(stagingRequest).toHaveBeenCalledOnce();
  });

  it("fails closed when the configured target changes during callback or after activation", async () => {
    const origin = "https://private.example.test";
    const productionEnv = {
      WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my.whoxos.app",
      WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "production",
    };
    const request = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/v1/connector/enrollments")) {
        return Response.json({
          enrollmentId: "enroll-production",
          verificationUrl: "https://my.whoxos.app/connections/enroll?id=enroll-production",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }, { status: 201 });
      }
      return Response.json({
        id: loadWHOXOSCloudConnectorIdentity()?.instanceId,
        environment: "production",
        origins: [origin],
      });
    });
    await startWHOXOSCloudConnectorEnrollment({ origin, env: productionEnv, request: request as typeof fetch });
    const pending = loadWHOXOSCloudConnectorIdentity()!;
    const changedTargetRequest = vi.fn();

    await expect(completeWHOXOSCloudConnectorEnrollment({
      enrollmentId: "enroll-production",
      approvalCode: "approval-code",
      state: pending.pending!.returnState,
      env: {
        WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app",
        WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "staging",
      },
      request: changedTargetRequest as typeof fetch,
    })).rejects.toThrow(/Invalid or expired/);
    expect(changedTargetRequest).not.toHaveBeenCalled();

    await completeWHOXOSCloudConnectorEnrollment({
      enrollmentId: "enroll-production",
      approvalCode: "approval-code",
      state: pending.pending!.returnState,
      env: productionEnv,
      request: request as typeof fetch,
    });
    const activeIdentity = loadWHOXOSCloudConnectorIdentity()!;
    const activeSwitchRequest = vi.fn();
    const stagingEnv = {
      WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app",
      WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "staging",
    };

    await expect(startWHOXOSCloudConnectorEnrollment({
      origin,
      env: stagingEnv,
      request: activeSwitchRequest as typeof fetch,
    })).rejects.toThrow(/another target/);
    expect(activeSwitchRequest).not.toHaveBeenCalled();
    expect(loadWHOXOSCloudConnectorIdentity()).toEqual(activeIdentity);
    expect(whoxosCloudConnectorConfigFromEnv(stagingEnv)).toBeNull();
  });

  it("treats managed environment identity as an atomic override of local identity", async () => {
    const origin = "https://private.example.test";
    const productionEnv = {
      WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my.whoxos.app",
      WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "production",
    };
    const request = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/v1/connector/enrollments")) {
        return Response.json({
          enrollmentId: "enroll-production",
          verificationUrl: "https://my.whoxos.app/connections/enroll?id=enroll-production",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }, { status: 201 });
      }
      return Response.json({
        id: loadWHOXOSCloudConnectorIdentity()?.instanceId,
        environment: "production",
        origins: [origin],
      });
    });
    await startWHOXOSCloudConnectorEnrollment({ origin, env: productionEnv, request: request as typeof fetch });
    const pending = loadWHOXOSCloudConnectorIdentity()!;
    await completeWHOXOSCloudConnectorEnrollment({
      enrollmentId: "enroll-production",
      approvalCode: "approval-code",
      state: pending.pending!.returnState,
      env: productionEnv,
      request: request as typeof fetch,
    });
    const localIdentity = loadWHOXOSCloudConnectorIdentity()!;

    const managedEnv = {
      WHOXOS_CLOUD_CONNECTOR_INSTANCE_ID: "managed-staging-instance",
      WHOXOS_CLOUD_CONNECTOR_SIGN_PRIVATE_KEY: "managed-signing-key",
      WHOXOS_CLOUD_CONNECTOR_SEAL_PRIVATE_KEY: "managed-sealing-key",
      WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "staging",
      WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app",
      WHOXOS_PUBLIC_URL: "https://managed-stack.example.test",
    };
    expect(whoxosCloudConnectorEnrollmentStatus(managedEnv)).toEqual({
      configured: true,
      status: "active",
      brokerBaseUrl: "https://my-staging.whoxos.app",
      instanceId: "managed-staging-instance",
      environment: "staging",
      origins: ["https://managed-stack.example.test"],
    });
    expect(whoxosCloudConnectorConfigFromEnv(managedEnv)).toMatchObject({
      baseUrl: "https://my-staging.whoxos.app",
      instanceId: "managed-staging-instance",
      environment: "staging",
      signPrivateKey: "managed-signing-key",
      sealPrivateKey: "managed-sealing-key",
    });
    expect(loadWHOXOSCloudConnectorIdentity()).toEqual(localIdentity);

    for (const omitted of [
      "WHOXOS_CLOUD_CONNECTOR_INSTANCE_ID",
      "WHOXOS_CLOUD_CONNECTOR_SIGN_PRIVATE_KEY",
      "WHOXOS_CLOUD_CONNECTOR_SEAL_PRIVATE_KEY",
      "WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT",
    ] as const) {
      const partialManagedEnv: NodeJS.ProcessEnv = { ...managedEnv };
      delete partialManagedEnv[omitted];
      expect(whoxosCloudConnectorEnrollmentStatus(partialManagedEnv)).toMatchObject({
        configured: false,
        status: "unverified",
        instanceId: null,
        environment: "staging",
      });
      expect(() => whoxosCloudConnectorConfigFromEnv(partialManagedEnv)).toThrow(/incomplete/);
      expect(loadWHOXOSCloudConnectorIdentity()).toEqual(localIdentity);
    }

    expect(whoxosCloudConnectorConfigFromEnv(productionEnv)).toMatchObject({
      baseUrl: localIdentity.brokerBaseUrl,
      instanceId: localIdentity.instanceId,
      environment: localIdentity.environment,
      signPrivateKey: localIdentity.signPrivateKey,
      sealPrivateKey: localIdentity.sealPrivateKey,
    });
  });

  it("rejects known Cloud broker and environment mismatches", () => {
    const managedIdentity = {
      WHOXOS_CLOUD_CONNECTOR_INSTANCE_ID: "managed-instance",
      WHOXOS_CLOUD_CONNECTOR_SIGN_PRIVATE_KEY: "managed-signing-key",
      WHOXOS_CLOUD_CONNECTOR_SEAL_PRIVATE_KEY: "managed-sealing-key",
    };
    const mismatches = [
      {
        ...managedIdentity,
        WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my.whoxos.app",
        WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "staging",
      },
      {
        ...managedIdentity,
        WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app",
        WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "production",
      },
    ];
    for (const env of mismatches) {
      expect(() => whoxosCloudConnectorEnrollmentStatus(env)).toThrow(/do not match/);
      expect(() => whoxosCloudConnectorConfigFromEnv(env)).toThrow(/do not match/);
    }
    expect(() => whoxosCloudConnectorEnrollmentStatus({
      WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "staging",
    })).toThrow(/do not match/);
  });

  it("does not create or complete self-host enrollment with managed identity configuration", async () => {
    const origin = "https://private.example.test";
    const localEnv = {
      WHOXOS_CLOUD_CONNECTOR_BASE_URL: "https://my-staging.whoxos.app",
      WHOXOS_CLOUD_CONNECTOR_ENVIRONMENT: "staging",
    };
    const enrollmentRequest = vi.fn(async () => Response.json({
      enrollmentId: "enroll-local",
      verificationUrl: "https://my-staging.whoxos.app/connections/enroll?id=enroll-local",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, { status: 201 }));
    await startWHOXOSCloudConnectorEnrollment({
      origin,
      env: localEnv,
      request: enrollmentRequest as typeof fetch,
    });
    const pendingIdentity = loadWHOXOSCloudConnectorIdentity()!;
    const managedEnv = {
      ...localEnv,
      WHOXOS_CLOUD_CONNECTOR_INSTANCE_ID: "managed-staging-instance",
      WHOXOS_CLOUD_CONNECTOR_SIGN_PRIVATE_KEY: "managed-signing-key",
      WHOXOS_CLOUD_CONNECTOR_SEAL_PRIVATE_KEY: "managed-sealing-key",
    };
    const managedRequest = vi.fn();

    await expect(startWHOXOSCloudConnectorEnrollment({
      origin,
      env: managedEnv,
      request: managedRequest as typeof fetch,
    })).rejects.toThrow(/unavailable with managed identity/);
    await expect(completeWHOXOSCloudConnectorEnrollment({
      enrollmentId: "enroll-local",
      approvalCode: "approval-code",
      state: pendingIdentity.pending!.returnState,
      env: managedEnv,
      request: managedRequest as typeof fetch,
    })).rejects.toThrow(/Invalid or expired/);
    expect(managedRequest).not.toHaveBeenCalled();
    expect(loadWHOXOSCloudConnectorIdentity()).toEqual(pendingIdentity);
  });

  it("does not treat legacy WHOXOS ID keys as a Cloud enrollment", () => {
    expect(whoxosCloudConnectorEnrollmentStatus({
      WHOXOS_ID_CONNECTOR_INSTANCE_ID: "legacy-instance",
      WHOXOS_ID_CONNECTOR_SIGN_PRIVATE_KEY: "legacy-signing-key",
      WHOXOS_ID_CONNECTOR_SEAL_PRIVATE_KEY: "legacy-sealing-key",
      WHOXOS_ID_CONNECTOR_ENVIRONMENT: "production",
      WHOXOS_ID_CONNECTOR_BASE_URL: "https://id.whoxos.app",
    })).toMatchObject({
      configured: false,
      status: "not_configured",
      brokerBaseUrl: "https://my.whoxos.app",
      instanceId: null,
    });
  });
});
