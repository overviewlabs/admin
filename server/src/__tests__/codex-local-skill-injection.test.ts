import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureCodexSkillsInjected } from "@whoxos/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createWHOXOSRepoSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "server"), { recursive: true });
  await fs.mkdir(path.join(root, "packages", "adapter-utils"), { recursive: true });
  await fs.mkdir(path.join(root, "skills", skillName), { recursive: true });
  await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), '{"name":"whoxos"}\n', "utf8");
  await fs.writeFile(
    path.join(root, "skills", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

async function createCustomSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "custom", skillName), { recursive: true });
  await fs.writeFile(
    path.join(root, "custom", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

describe("codex local adapter skill injection", () => {
  const whoxosKey = "whoxos/whoxos/whoxos";
  const createAgentKey = "whoxos/whoxos/whoxos-create-agent";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("repairs a Codex WHOXOS skill symlink that still points at another live checkout", async () => {
    const currentRepo = await makeTempDir("whoxos-codex-current-");
    const oldRepo = await makeTempDir("whoxos-codex-old-");
    const skillsHome = await makeTempDir("whoxos-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createWHOXOSRepoSkill(currentRepo, "whoxos");
    await createWHOXOSRepoSkill(currentRepo, "whoxos-create-agent");
    await createWHOXOSRepoSkill(oldRepo, "whoxos");
    await fs.symlink(path.join(oldRepo, "skills", "whoxos"), path.join(skillsHome, "whoxos"));

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [
          {
            key: whoxosKey,
            runtimeName: "whoxos",
            source: path.join(currentRepo, "skills", "whoxos"),
          },
          {
            key: createAgentKey,
            runtimeName: "whoxos-create-agent",
            source: path.join(currentRepo, "skills", "whoxos-create-agent"),
          },
        ],
      },
    );

    expect(await fs.realpath(path.join(skillsHome, "whoxos"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "whoxos")),
    );
    expect(await fs.realpath(path.join(skillsHome, "whoxos-create-agent"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "whoxos-create-agent")),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Repaired Codex skill "whoxos"'),
      }),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Injected Codex skill "whoxos-create-agent"'),
      }),
    );
  });

  it("preserves a custom Codex skill symlink outside WHOXOS repo checkouts", async () => {
    const currentRepo = await makeTempDir("whoxos-codex-current-");
    const customRoot = await makeTempDir("whoxos-codex-custom-");
    const skillsHome = await makeTempDir("whoxos-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(customRoot);
    cleanupDirs.add(skillsHome);

    await createWHOXOSRepoSkill(currentRepo, "whoxos");
    await createCustomSkill(customRoot, "whoxos");
    await fs.symlink(path.join(customRoot, "custom", "whoxos"), path.join(skillsHome, "whoxos"));

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{
        key: whoxosKey,
        runtimeName: "whoxos",
        source: path.join(currentRepo, "skills", "whoxos"),
      }],
    });

    expect(await fs.realpath(path.join(skillsHome, "whoxos"))).toBe(
      await fs.realpath(path.join(customRoot, "custom", "whoxos")),
    );
  });

  it("prunes broken symlinks for unavailable WHOXOS repo skills before Codex starts", async () => {
    const currentRepo = await makeTempDir("whoxos-codex-current-");
    const oldRepo = await makeTempDir("whoxos-codex-old-");
    const skillsHome = await makeTempDir("whoxos-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createWHOXOSRepoSkill(currentRepo, "whoxos");
    await createWHOXOSRepoSkill(oldRepo, "agent-browser");
    const staleTarget = path.join(oldRepo, "skills", "agent-browser");
    await fs.symlink(staleTarget, path.join(skillsHome, "agent-browser"));
    await fs.rm(staleTarget, { recursive: true, force: true });

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [{
          key: whoxosKey,
          runtimeName: "whoxos",
          source: path.join(currentRepo, "skills", "whoxos"),
        }],
      },
    );

    await expect(fs.lstat(path.join(skillsHome, "agent-browser"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Removed stale Codex skill "agent-browser"'),
      }),
    );
  });

  it("preserves other live WHOXOS skill symlinks in the shared workspace skill directory", async () => {
    const currentRepo = await makeTempDir("whoxos-codex-current-");
    const skillsHome = await makeTempDir("whoxos-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(skillsHome);

    await createWHOXOSRepoSkill(currentRepo, "whoxos");
    await createWHOXOSRepoSkill(currentRepo, "agent-browser");
    await fs.symlink(
      path.join(currentRepo, "skills", "agent-browser"),
      path.join(skillsHome, "agent-browser"),
    );

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{
        key: whoxosKey,
        runtimeName: "whoxos",
        source: path.join(currentRepo, "skills", "whoxos"),
      }],
    });

    expect((await fs.lstat(path.join(skillsHome, "whoxos"))).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(path.join(skillsHome, "agent-browser"))).isSymbolicLink()).toBe(true);
    expect(await fs.realpath(path.join(skillsHome, "agent-browser"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "agent-browser")),
    );
  });
});
