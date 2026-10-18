/**
 * Development shim for the package-local runner runtime.
 *
 * Source-mode server entry points do not build workspace dependencies first,
 * so this shim loads the package source through the TypeScript runtime. The
 * server build replaces the emitted shim with the package's compiled `dist`
 * tree so published server packages have no workspace runtime dependency.
 * Keep server imports pointed at this relative boundary.
 */
type RunnerModule = typeof import("@whoxos/whoxos-runner");

export type {
  WHOXOSJsonValue,
  WHOXOSQuestionResponse,
  WHOXOSSemanticActionBinding,
  WHOXOSSemanticActionId,
  WHOXOSSemanticAuthorizationRecord,
  WHOXOSSemanticRunContext,
  WHOXOSSemanticToolCall,
  WHOXOSSemanticToolDefinition,
  WHOXOSSemanticToolResult,
  WHOXOSRunnerAuthorizedToolSet,
  WHOXOSQuestionSet,
  WHOXOSRuntimeInputRequest,
  CompleteControlPlaneRunInput,
  ControlPlanePort,
  HarnessRuntimeRequestKind,
  HarnessRuntimeRequestResolution,
  NativeAcpxAgent,
  NativeAcpxPermissionMode,
  NativeCodexApprovalPolicy,
  NativeExecutionInput,
  NativeExecutionInputV4,
  NativeInteractionResponseEnvelope,
  NativeOpenCodePermissionMode,
  NativePlanningContext,
  NativeRunEvent,
  NativeRunResult,
  NativeRuntimeAssetReference,
  NativeRuntimeContextSnapshot,
  NativeSession,
  NativeSessionBackend,
  NativeSessionGoalControl,
  OpenControlPlaneRunInput,
  PersistedNativeSession,
  PrpEvent,
  PrpIgnoredAttentionRequest,
  PrpNormalizedAttentionRequest,
  PrpStructuredRunResult,
  PrpTerminalState,
  PrpVerificationReasonCode,
  PrpWireConnection,
  ReplayControlPlaneEventsInput,
  RunnerProcessHandle,
  RunnerProcessLaunchSpec,
  StrictCompletionContractInput,
  TransportCloseReason,
} from "@whoxos/whoxos-runner";
export type DurablePrpControlPlane =
  import("@whoxos/whoxos-runner").DurablePrpControlPlane;
export type WHOXOSSemanticDispatcher =
  import("@whoxos/whoxos-runner").WHOXOSSemanticDispatcher;

const sourceUrl = new URL(
  "../../../../packages/whoxos-runner/src/index.ts",
  import.meta.url,
);
const runner = (await import(sourceUrl.href)) as RunnerModule;

export const DurablePrpControlPlane = runner.DurablePrpControlPlane;
export const inspectWarmRunTransition = runner.inspectWarmRunTransition;
export const readRunnerdArtifactBinding = runner.readRunnerdArtifactBinding;
export const NativeSessionCleanupQuarantinedError =
  runner.NativeSessionCleanupQuarantinedError;
export const NativeSessionProtocolIntegrityError =
  runner.NativeSessionProtocolIntegrityError;
export const WHOXOSSemanticDispatcher = runner.WHOXOSSemanticDispatcher;
export const CAPABILITY_SEMANTIC_TOOL_CATALOG =
  runner.CAPABILITY_SEMANTIC_TOOL_CATALOG;
export const HarnessRuntimeRequestResolutionError =
  runner.HarnessRuntimeRequestResolutionError;
export const NATIVE_RUNTIME_ASSET_SCHEMA = runner.NATIVE_RUNTIME_ASSET_SCHEMA;
export const WHOXOS_EXECUTION_PROMPT = runner.WHOXOS_EXECUTION_PROMPT;
export const WHOXOS_EXECUTION_PROMPT_REVISION =
  runner.WHOXOS_EXECUTION_PROMPT_REVISION;
export const acpxRuntimeSessionDirectoryName =
  runner.acpxRuntimeSessionDirectoryName;
export const canonicalNativeRuntimeContextDigest =
  runner.canonicalNativeRuntimeContextDigest;
export const createNativeSessionBackend = runner.createNativeSessionBackend;
export const createWHOXOSRunnerAuthorizedToolSet =
  runner.createWHOXOSRunnerAuthorizedToolSet;
export const createRunnerdCodexTransport: (
  options?: import("@whoxos/whoxos-runner").RunnerdCodexTransportOptions,
) => import("@whoxos/whoxos-runner").RunnerdCodexTransport =
  runner.createRunnerdCodexTransport;
export const defaultCapabilityRunnerdBinary =
  runner.defaultCapabilityRunnerdBinary;
export const executeNativeSession = runner.executeNativeSession;
export const applyNativeSessionGoalControl =
  runner.applyNativeSessionGoalControl;
export const completeRetainedNativeSessionCleanup = runner.completeRetainedNativeSessionCleanup;
export const settleRetainedRunnerdSession = runner.settleRetainedRunnerdSession;
export const retainedRunnerdMaintenanceIsIdle =
  runner.retainedRunnerdMaintenanceIsIdle;
export const drainRetainedRunnerdMaintenanceOperations =
  runner.drainRetainedRunnerdMaintenanceOperations;
export const nativeRuntimePromptDigest = runner.nativeRuntimePromptDigest;
export const normalizePrpResultSignals = runner.normalizePrpResultSignals;
export const parseCodexTurnDiff = runner.parseCodexTurnDiff;
export const parseHarnessRuntimeRequestResolution =
  runner.parseHarnessRuntimeRequestResolution;
export const parseNativeExecutionInput = runner.parseNativeExecutionInput;
export const parseNativeRuntimeContext = runner.parseNativeRuntimeContext;
export const parseWHOXOSQuestionSet = runner.parseWHOXOSQuestionSet;
export const parseWHOXOSQuestionResponse =
  runner.parseWHOXOSQuestionResponse;
export const resolveQualifiedAcpxProfile = runner.resolveQualifiedAcpxProfile;
export const resolveSourceCodexHome = runner.resolveSourceCodexHome;
export const validatePrpEvent = runner.validatePrpEvent;
export const validatePrpStructuredRunResult =
  runner.validatePrpStructuredRunResult;

export const NativeProviderTerminalFailure = runner.NativeProviderTerminalFailure;

export const completeTerminatedRemoteNativeSessionCleanup = runner.completeTerminatedRemoteNativeSessionCleanup;
export const completeTerminatedLocalNativeSessionCleanup = runner.completeTerminatedLocalNativeSessionCleanup;
