/** Reduce repeated prose, preserving the complete permitted roster and task states.
 * Full task details remain available through the authenticated read tools. */
export function compactVoiceTurnContext(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return snapshot;
  const value = snapshot as Record<string, unknown>;
  const agents = Array.isArray(value.agents) ? value.agents.map(agent => {
    if (!agent || typeof agent !== "object") return agent;
    const { capabilities: _capabilities, ...identity } = agent;
    return identity;
  }) : value.agents;
  const originalWork = value.work as Record<string, unknown> | undefined;
  const work = originalWork && Array.isArray(originalWork.tasks) ? {
    ...originalWork,
    tasks: originalWork.tasks.map(task => {
      const update = task?.recordedUpdate;
      if (!update || typeof update.text !== "string" || update.text.length <= 160) return task;
      return { ...task, recordedUpdate: { ...update, text: update.text.slice(0, 160), truncated: true } };
    }),
  } : value.work;
  return { ...value, ...(agents === undefined ? {} : { agents }), ...(work === undefined ? {} : { work }), detailMode: "compact; agent capabilities and full task updates require a scoped read when needed" };
}
