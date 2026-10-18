/** A Jev decision adapter uses its explicit TypeSafe secret, not a managed chat
 * provider connection. Only an explicit harness change detaches the old binding;
 * the provider account and its credentials remain intact. */
export function typesafeRuntimeTransition(
  previousType: string,
  nextType: string,
  existing: Record<string, unknown>,
  requested: Record<string, unknown> | null,
) {
  const detachAiConnection = previousType !== nextType && nextType === "typesafe";
  if (!detachAiConnection) return { detachAiConnection, runtimeConfig: requested };
  const runtimeConfig = { ...existing, ...requested };
  delete runtimeConfig.aiConnection;
  return { detachAiConnection, runtimeConfig };
}
