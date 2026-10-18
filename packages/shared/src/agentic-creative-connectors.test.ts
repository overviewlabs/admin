import { describe, expect, it } from "vitest";
import { getAppStoreDefinition, getAvailableConnectionMethod } from "./app-definitions.js";
import { appDefinitionsSchema } from "./validators/app-definition.js";

describe("agentic trading and creative connectors", () => {
  it.each([
    ["robinhood", "https://agent.robinhood.com/mcp/trading", "S4", ["internal"]],
    ["higgsfield", "https://mcp.higgsfield.ai/mcp", "S3", ["openid", "email", "offline_access"]],
  ] as const)("exposes %s through the governed OAuth connection flow", (slug, url, riskTier, scopes) => {
    const app = getAppStoreDefinition(slug)!;
    expect(app).toBeTruthy();
    expect(() => appDefinitionsSchema.parse([app])).not.toThrow();
    const method = getAvailableConnectionMethod(app, "mcp-oauth")!;
    expect(method).toMatchObject({ transport: "mcp_remote", auth: "oauth", grantKinds: ["user"], riskTier });
    expect(method.ownershipModes).toContain("dcr");
    expect(method.defaults?.serverUrl).toBe(url);
    expect(method.defaults?.scopesHint).toEqual(scopes);
    // Let the common broker discover authoritative metadata and manage refresh.
    expect(method.defaults?.authorizationEndpoint).toBeUndefined();
    expect(method.defaults?.tokenEndpoint).toBeUndefined();
    expect(method.credentialFields ?? []).toEqual([]);
    expect(app.urlPatterns).toEqual([url]);
    expect(app.branding?.logoUrl).toBe(`/brands/apps/${slug}.png`);
    expect(method.consoleLinks?.docs).toBe(app.docsUrl);
  });
});
