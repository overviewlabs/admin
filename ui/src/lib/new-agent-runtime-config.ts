import { AGENT_DEFAULT_MAX_CONCURRENT_RUNS } from "@whoxos/shared";
import { defaultCreateValues } from "../components/agent-config-defaults";

export function buildNewAgentRuntimeConfig(input?: {
  heartbeatEnabled?: boolean;
  intervalSec?: number;
  reaMode?: boolean;
}): Record<string, unknown> {
  const config: Record<string, unknown> = {
    ...(input?.reaMode === true ? { reaMode: true } : {}),
    heartbeat: {
      enabled: input?.heartbeatEnabled ?? defaultCreateValues.heartbeatEnabled,
      intervalSec: input?.intervalSec ?? defaultCreateValues.intervalSec,
      wakeOnDemand: true,
      skipTimerWhenNoActionableWork: true,
      cooldownSec: 10,
      maxConcurrentRuns: AGENT_DEFAULT_MAX_CONCURRENT_RUNS,
    },
  };

  return config;
}
