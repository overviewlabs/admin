/** Jev agents are evaluators, never user-facing conversation agents. */
export const DECISION_ENGINE_NAME = "Real-Time Decision Engine";
export const DECISION_ENGINE_KEY = "real-time-decision-engine";
export function isDecisionEngine(agent: { adapterType?: string; metadata?: Record<string, unknown> | null }) {
  return agent.adapterType === "typesafe";
}
