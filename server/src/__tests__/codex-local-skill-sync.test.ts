import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCodexSkills,
  syncCodexSkills,
} from "@whoxos/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("codex local skill sync", () => {
  const whoxosKey = "whoxos/whoxos/whoxos";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("defaults the operational WHOXOS skill for workspace injection on the next run", async () => {
    const codexHome = await makeTempDir("whoxos-codex-skill-sync-");
    cleanupDirs.add(codexHome);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
      },
    } as const;

    const before = await listCodexSkills(ctx);
    expect(before.mode).toBe("ephemeral");
    expect(before.desiredSkills).toContain(whoxosKey);
    expect(before.entries.find((entry) => entry.key === whoxosKey)?.state).toBe("configured");
    expect(before.entries.find((entry) => entry.key === whoxosKey)?.detail).toContain("CODEX_HOME/skills/");
  });

  it("does not apply the legacy operational skill default to the native runner", async () => {
    const snapshot = await listCodexSkills({
      agentId: "agent-native",
      companyId: "company-1",
      adapterType: "whoxos_runner",
      config: {},
    });

    expect(snapshot.adapterType).toBe("whoxos_runner");
    expect(snapshot.desiredSkills).toEqual([]);
    expect(snapshot.entries.find((entry) => entry.key === whoxosKey)?.state).toBe("available");
  });

  it("does not persist WHOXOS skills into CODEX_HOME during sync", async () => {
    const codexHome = await makeTempDir("whoxos-codex-skill-prune-");
    cleanupDirs.add(codexHome);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        whoxosSkillSync: {
          desiredSkills: [whoxosKey],
        },
      },
    } as const;

    const after = await syncCodexSkills(configuredCtx, [whoxosKey]);
    expect(after.mode).toBe("ephemeral");
    expect(after.entries.find((entry) => entry.key === whoxosKey)?.state).toBe("configured");
    await expect(fs.lstat(path.join(codexHome, "skills", "whoxos"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("normalizes legacy flat WHOXOS skill refs before reporting configured state", async () => {
    const codexHome = await makeTempDir("whoxos-codex-legacy-skill-sync-");
    cleanupDirs.add(codexHome);

    const snapshot = await listCodexSkills({
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        whoxosSkillSync: {
          desiredSkills: ["whoxos"],
        },
      },
    });

    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.desiredSkills).toContain(whoxosKey);
    expect(snapshot.desiredSkills).not.toContain("whoxos");
    expect(snapshot.entries.find((entry) => entry.key === whoxosKey)?.state).toBe("configured");
    expect(snapshot.entries.find((entry) => entry.key === "whoxos")).toBeUndefined();
  });
});
