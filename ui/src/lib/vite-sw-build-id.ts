import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

/**
 * Stamp the service worker with a per-build id so bundle-only deploys still
 * refresh parked tabs.
 *
 * `sw.js` is a static public asset copied verbatim into the build, and its
 * update machinery (`service-worker-updates.ts`) only reloads a parked tab when
 * a *new* worker takes control — which happens only when `sw.js` changes
 * byte-for-byte. Without this, a deploy that ships a new app bundle but the same
 * `sw.js` installs no new worker, so an open tab keeps running the old bundle
 * until someone reloads by hand. Rewriting the placeholder with a value derived
 * from the bundle makes `sw.js` change exactly when the app does.
 */

export const SERVICE_WORKER_BUILD_ID_PLACEHOLDER = "__WHOXOS_BUILD_ID__";

/**
 * Replace the build-id placeholder in a service-worker source string.
 *
 * Throws when the placeholder is absent: that means the worker drifted away
 * from the contract (renamed or removed placeholder) and would ship a service
 * worker that never rotates — the exact bug this plugin exists to prevent — so
 * a loud build failure beats a silent no-op.
 */
export function stampServiceWorkerBuildId(source: string, buildId: string): string {
  if (!source.includes(SERVICE_WORKER_BUILD_ID_PLACEHOLDER)) {
    throw new Error(
      `service worker is missing the ${SERVICE_WORKER_BUILD_ID_PLACEHOLDER} placeholder; ` +
        "the build cannot stamp a build id and parked tabs would not refresh after a deploy",
    );
  }
  if (!buildId) {
    throw new Error("refusing to stamp the service worker with an empty build id");
  }
  return source.split(SERVICE_WORKER_BUILD_ID_PLACEHOLDER).join(buildId);
}

/**
 * Include the HTML shell as well as the entry chunk: startup recovery and
 * other inline scripts can change without changing the JavaScript bundle.
 */
export function deriveBuildIdFromEntryFileName(entryFileName: string, html?: string): string {
  const base = path.basename(entryFileName).replace(/\.js$/, "");
  // Keep only characters that are safe inside a Cache Storage name.
  const sanitized = base.replace(/[^A-Za-z0-9_-]/g, "-");
  const entryId = sanitized || "build";
  return html === undefined ? entryId : `${entryId}-${createHash("sha256").update(html).digest("hex").slice(0, 12)}`;
}

export function serviceWorkerBuildIdPlugin(
  options: { serviceWorkerFileName?: string } = {},
): Plugin {
  const serviceWorkerFileName = options.serviceWorkerFileName ?? "sw.js";
  let buildId: string | null = null;
  let outDir = "dist";

  return {
    name: "whoxos-sw-build-id",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (chunk) => chunk.type === "chunk" && chunk.isEntry,
      );
      if (entry) {
        buildId = entry.fileName;
      }
    },
    closeBundle() {
      const swPath = path.resolve(outDir, serviceWorkerFileName);
      const source = fs.readFileSync(swPath, "utf8");
      const html = fs.readFileSync(path.resolve(outDir, "index.html"), "utf8");
      const stamped = stampServiceWorkerBuildId(source, deriveBuildIdFromEntryFileName(buildId ?? "build", html));
      fs.writeFileSync(swPath, stamped);
    },
  };
}
