import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WHOXOS_RUNNERD_BUILD_METADATA_SCHEMA } from "./build-metadata.js";
import {
  WHOXOSRunnerdArtifactError,
  parseWHOXOSRunnerdBuildMetadata,
  resolveWHOXOSRunnerdArtifact,
} from "./runnerd-artifact.js";

const valid = {
  schema: WHOXOS_RUNNERD_BUILD_METADATA_SCHEMA,
  binaryName: "whoxos-runnerd",
  packageName: "@whoxos/whoxos-runner",
  packageVersion: "0.0.0",
  binaryContractVersion: 2,
  nativeExecutionVersion: 1,
  harnessDriverVersion: 1,
  prp: { name: "whoxos.runner", minimumVersion: 1, maximumVersion: 1 },
};

describe("runnerd artifact metadata", () => {
  it("parses the exact runnerd identity", () => {
    expect(parseWHOXOSRunnerdBuildMetadata(valid)).toEqual(valid);
  });

  it("rejects an unknown binary metadata schema", () => {
    expect(() => parseWHOXOSRunnerdBuildMetadata({ ...valid, schema: "runnerd/v2" }))
      .toThrow(WHOXOSRunnerdArtifactError);
    expect(() => parseWHOXOSRunnerdBuildMetadata({ ...valid, schema: "runnerd/v2" }))
      .toThrow(/unsupported/);
  });

  it("rejects an invalid or mismatched explicit artifact digest before execution", async () => {
    await expect(resolveWHOXOSRunnerdArtifact({
      executablePath: "/does/not/matter",
      expectedSha256: "not-a-digest",
    })).rejects.toMatchObject({ issue: "digest_invalid" });

    const root = await mkdtemp(join(tmpdir(), "whoxos-runnerd-artifact-"));
    const executablePath = join(root, "whoxos-runnerd");
    try {
      await writeFile(executablePath, "not the expected binary");
      await expect(resolveWHOXOSRunnerdArtifact({
        executablePath,
        expectedSha256: `sha256:${"0".repeat(64)}`,
      })).rejects.toMatchObject({
        issue: "digest_mismatch",
        message: expect.stringContaining("observed sha256:"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "executes a private copy of the verified bytes when the source path is swapped",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "whoxos-runnerd-artifact-"));
      const executablePath = join(root, "whoxos-runnerd");
      const verifiedScript = `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(valid)}'\n`;
      const replacementScript = "#!/bin/sh\nprintf '%s\\n' 'unverified replacement'\n";
      const expectedSha256 = `sha256:${createHash("sha256").update(verifiedScript).digest("hex")}`;

      try {
        await writeFile(executablePath, verifiedScript, { mode: 0o700 });
        const canonicalExecutablePath = await realpath(executablePath);
        const input = {
          executablePath,
          expectedSha256,
          get metadataTimeoutMs() {
            writeFileSync(executablePath, replacementScript, { mode: 0o700 });
            return 5_000;
          },
        };

        await expect(resolveWHOXOSRunnerdArtifact(input)).resolves.toMatchObject({
          executablePath: canonicalExecutablePath,
          sha256: expectedSha256,
          byteSize: Buffer.byteLength(verifiedScript),
          buildMetadata: valid,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
