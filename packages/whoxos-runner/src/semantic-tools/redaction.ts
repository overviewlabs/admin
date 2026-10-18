import type { CapabilityJsonValue } from "../mock-core/capability-control-plane-types.js";
import type { WHOXOSJsonValue } from "../catalog/semantic-action-types.js";

export const CAPABILITY_REDACTED = "[REDACTED]";

export function containsProtectedSemanticData(value: unknown, key = ""): boolean {
  const inspected = inspectWHOXOSSemanticValue(
    key.length === 0 ? value : { [key]: value },
  );
  // Fail closed when provider-controlled values exceed the shared safety bound.
  return inspected.containsProtectedData || !inspected.withinBounds;
}

export function redactSemanticValue(value: unknown, key = ""): CapabilityJsonValue {
  if (key.length === 0) {
    return redactWHOXOSSemanticValue(value) as CapabilityJsonValue;
  }
  const wrapped = redactWHOXOSSemanticValue({ [key]: value });
  if (typeof wrapped !== "object" || wrapped === null || Array.isArray(wrapped)) {
    return CAPABILITY_REDACTED;
  }
  const object = wrapped as { readonly [entryKey: string]: WHOXOSJsonValue };
  return (object[key] ?? CAPABILITY_REDACTED) as CapabilityJsonValue;
}

const WHOXOS_SENSITIVE_KEY =
  /(?:authorization|cookie|credential|password|passwd|private.?key|secret|token|api.?key|connection.?string)/i;
const WHOXOS_SECRET_VALUE =
  /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|pk|pcgw|ghp|github_pat)_[A-Za-z0-9_-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/gi;
const WHOXOS_SECRET_QUERY =
  /([?&](?:code|key|secret|state|token|api[_-]?key|access[_-]?token)=)[^&#\s]+/gi;
const WHOXOS_WHOXOS_SECRET_QUERY_DETECT =
  /[?&](?:code|key|secret|state|token|api[_-]?key|access[_-]?token)=[^&#\s]+/i;

const WHOXOS_MAX_DEPTH = 16;
const WHOXOS_MAX_NODES = 10_000;
const WHOXOS_MAX_ARRAY_ITEMS = 512;
const WHOXOS_MAX_OBJECT_KEYS = 512;
const WHOXOS_MAX_STRING_LENGTH = 200_000;

export const WHOXOS_SEMANTIC_REDACTED = "[REDACTED]";
export const WHOXOS_SEMANTIC_TRUNCATED = "[TRUNCATED]";

export interface WHOXOSSemanticValueSafety {
  readonly containsProtectedData: boolean;
  readonly withinBounds: boolean;
}

export function inspectWHOXOSSemanticValue(
  value: unknown,
): WHOXOSSemanticValueSafety {
  const state = { nodes: 0, protected: false, withinBounds: true };
  inspect(value, "", 0, state, new Set<object>());
  return Object.freeze({
    containsProtectedData: state.protected,
    withinBounds: state.withinBounds,
  });
}

export function redactWHOXOSSemanticValue(
  value: unknown,
): WHOXOSJsonValue {
  const state = { nodes: 0 };
  return redact(value, "", 0, state, new Set<object>());
}

function inspect(
  value: unknown,
  key: string,
  depth: number,
  state: { nodes: number; protected: boolean; withinBounds: boolean },
  ancestors: Set<object>,
): void {
  state.nodes += 1;
  if (state.nodes > WHOXOS_MAX_NODES || depth > WHOXOS_MAX_DEPTH) {
    state.withinBounds = false;
    return;
  }
  if (WHOXOS_SENSITIVE_KEY.test(key)) state.protected = true;
  if (typeof value === "string") {
    if (value.length > WHOXOS_MAX_STRING_LENGTH) state.withinBounds = false;
    WHOXOS_SECRET_VALUE.lastIndex = 0;
    if (WHOXOS_SECRET_VALUE.test(value) || WHOXOS_WHOXOS_SECRET_QUERY_DETECT.test(value)) {
      state.protected = true;
    }
    WHOXOS_SECRET_VALUE.lastIndex = 0;
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > WHOXOS_MAX_ARRAY_ITEMS) state.withinBounds = false;
    if (ancestors.has(value)) {
      state.withinBounds = false;
      return;
    }
    ancestors.add(value);
    for (const child of value.slice(0, WHOXOS_MAX_ARRAY_ITEMS)) {
      inspect(child, "", depth + 1, state, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  if (typeof value === "object" && value !== null) {
    if (ancestors.has(value)) {
      state.withinBounds = false;
      return;
    }
    const entries = Object.entries(value);
    if (entries.length > WHOXOS_MAX_OBJECT_KEYS) state.withinBounds = false;
    ancestors.add(value);
    for (const [childKey, child] of entries.slice(0, WHOXOS_MAX_OBJECT_KEYS)) {
      inspect(child, childKey, depth + 1, state, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  if (
    value !== null &&
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    typeof value !== "undefined"
  ) {
    state.withinBounds = false;
  }
}

function redact(
  value: unknown,
  key: string,
  depth: number,
  state: { nodes: number },
  ancestors: Set<object>,
): WHOXOSJsonValue {
  state.nodes += 1;
  if (state.nodes > WHOXOS_MAX_NODES || depth > WHOXOS_MAX_DEPTH) {
    return WHOXOS_SEMANTIC_TRUNCATED;
  }
  if (WHOXOS_SENSITIVE_KEY.test(key)) return WHOXOS_SEMANTIC_REDACTED;
  if (typeof value === "string") {
    WHOXOS_SECRET_VALUE.lastIndex = 0;
    const redacted = value
      .replace(WHOXOS_SECRET_VALUE, WHOXOS_SEMANTIC_REDACTED)
      .replace(WHOXOS_SECRET_QUERY, `$1${WHOXOS_SEMANTIC_REDACTED}`);
    WHOXOS_SECRET_VALUE.lastIndex = 0;
    return redacted.length <= WHOXOS_MAX_STRING_LENGTH
      ? redacted
      : `${redacted.slice(0, WHOXOS_MAX_STRING_LENGTH)}${WHOXOS_SEMANTIC_TRUNCATED}`;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return WHOXOS_SEMANTIC_TRUNCATED;
    ancestors.add(value);
    const result = value
      .slice(0, WHOXOS_MAX_ARRAY_ITEMS)
      .map((child) => redact(child, "", depth + 1, state, ancestors));
    ancestors.delete(value);
    if (value.length > WHOXOS_MAX_ARRAY_ITEMS) {
      result.push(WHOXOS_SEMANTIC_TRUNCATED);
    }
    return result;
  }
  if (typeof value === "object" && value !== null) {
    if (ancestors.has(value)) return WHOXOS_SEMANTIC_TRUNCATED;
    ancestors.add(value);
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, WHOXOS_MAX_OBJECT_KEYS)
      .map(
        ([childKey, child]) =>
          [
            childKey,
            redact(child, childKey, depth + 1, state, ancestors),
          ] as const,
      );
    ancestors.delete(value);
    const result: Record<string, WHOXOSJsonValue> =
      Object.fromEntries(entries);
    if (Object.keys(value).length > WHOXOS_MAX_OBJECT_KEYS) {
      result.__whoxos_truncated__ = WHOXOS_SEMANTIC_TRUNCATED;
    }
    return result;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean" || value === null) return value;
  return WHOXOS_SEMANTIC_TRUNCATED;
}
