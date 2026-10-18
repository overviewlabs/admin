import { createHash } from "node:crypto";

import { WHOXOS_RUNNER_COMPATIBILITY } from "../compatibility.js";
import {
  PRP_PROTOCOL_MIN_VERSION,
  PRP_PROTOCOL_NAME,
  PRP_PROTOCOL_VERSION,
} from "../protocol/replay-contract.js";
import { canonicalCapabilitySemanticCatalog } from "../semantic-tools/catalog.js";

export const WHOXOS_RUNNER_BUILD_METADATA_SCHEMA =
  "whoxos-runner/build-metadata/v1" as const;
export const WHOXOS_RUNNER_NATIVE_EXECUTION_SCHEMA =
  "whoxos-runner/native-execution/v1" as const;
export const WHOXOS_RUNNER_EVAL_INTEGRATION_SCHEMA =
  "whoxos-runner/evals-integration/v1" as const;
export const WHOXOS_RUNNERD_BUILD_METADATA_SCHEMA =
  "whoxos-runner/runnerd-build-metadata/v1" as const;

export const WHOXOS_RUNNER_SEMANTIC_CATALOG_SHA256 =
  `sha256:${createHash("sha256")
    .update(canonicalCapabilitySemanticCatalog())
    .digest("hex")}` as const;

/**
 * App-owned release metadata that Evals pins beside every native attempt.
 * Contract versions are independent from package semver so consumers can give
 * a precise mismatch instead of guessing from a package version.
 */
export const WHOXOS_RUNNER_BUILD_METADATA = Object.freeze({
  schema: WHOXOS_RUNNER_BUILD_METADATA_SCHEMA,
  package: Object.freeze({
    name: WHOXOS_RUNNER_COMPATIBILITY.packageName,
    version: WHOXOS_RUNNER_COMPATIBILITY.packageVersion,
  }),
  contracts: Object.freeze({
    evalIntegration: WHOXOS_RUNNER_COMPATIBILITY.components.evalIntegration,
    nativeExecution: WHOXOS_RUNNER_COMPATIBILITY.components.nativeExecution,
    runnerdArtifact: WHOXOS_RUNNER_COMPATIBILITY.components.runnerdBinary,
    prp: PRP_PROTOCOL_VERSION,
    semanticCatalog: WHOXOS_RUNNER_COMPATIBILITY.components.catalog,
    harnessDriver: WHOXOS_RUNNER_COMPATIBILITY.components.harnessDriver,
    controlPlaneAdapter: WHOXOS_RUNNER_COMPATIBILITY.components.controlPlaneAdapter,
    testkit: WHOXOS_RUNNER_COMPATIBILITY.components.testkit,
  }),
  prp: Object.freeze({
    name: PRP_PROTOCOL_NAME,
    minimumVersion: PRP_PROTOCOL_MIN_VERSION,
    maximumVersion: PRP_PROTOCOL_VERSION,
  }),
  semanticCatalog: Object.freeze({
    version: WHOXOS_RUNNER_COMPATIBILITY.components.catalog,
    sha256: WHOXOS_RUNNER_SEMANTIC_CATALOG_SHA256,
  }),
  runnerd: Object.freeze({
    binaryName: "whoxos-runnerd" as const,
    metadataSchema: WHOXOS_RUNNERD_BUILD_METADATA_SCHEMA,
    digestAlgorithm: "sha256" as const,
  }),
});

export type WHOXOSRunnerBuildMetadata = typeof WHOXOS_RUNNER_BUILD_METADATA;
