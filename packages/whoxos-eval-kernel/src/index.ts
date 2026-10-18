export const WHOXOS_EVAL_KERNEL_COMPATIBILITY = Object.freeze({
  schema: "whoxos.eval-kernel.compatibility.v1" as const,
  packageName: "@whoxos/whoxos-eval-kernel" as const,
  packageVersion: "0.1.0" as const,
  apiVersion: 1 as const,
});

export interface WHOXOSEvalScenario<TInput = unknown> {
  readonly id: string;
  readonly input: TInput;
}

export interface WHOXOSEvalCandidate<TCandidate = unknown> {
  readonly id: string;
  readonly config: TCandidate;
  /** Fail-closed runner/catalog/provider compatibility check. */
  readonly preflight?: () => void | Promise<void>;
}

export interface WHOXOSEvalResult<TOutput = unknown, TScore = unknown> {
  readonly scenarioId: string;
  readonly candidateId: string;
  readonly output: TOutput;
  readonly score: TScore;
}

export class WHOXOSEvalKernelConfigurationError extends Error {
  readonly code = "whoxos_eval_kernel_configuration_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "WHOXOSEvalKernelConfigurationError";
  }
}

/**
 * Generic deterministic matrix orchestration. Scenario definitions, provider
 * configuration, scorers, reports, and persistence remain caller-owned.
 */
export async function runWHOXOSEvalMatrix<
  TInput,
  TCandidate,
  TOutput,
  TScore,
>(input: {
  readonly scenarios: readonly WHOXOSEvalScenario<TInput>[];
  readonly candidates: readonly WHOXOSEvalCandidate<TCandidate>[];
  readonly execute: (context: {
    readonly scenario: WHOXOSEvalScenario<TInput>;
    readonly candidate: WHOXOSEvalCandidate<TCandidate>;
  }) => Promise<TOutput>;
  readonly score: (context: {
    readonly scenario: WHOXOSEvalScenario<TInput>;
    readonly candidate: WHOXOSEvalCandidate<TCandidate>;
    readonly output: TOutput;
  }) => Promise<TScore> | TScore;
}): Promise<readonly WHOXOSEvalResult<TOutput, TScore>[]> {
  assertUniqueNonEmptyIds("scenario", input.scenarios);
  assertUniqueNonEmptyIds("candidate", input.candidates);

  for (const candidate of input.candidates) {
    await candidate.preflight?.();
  }

  const results: WHOXOSEvalResult<TOutput, TScore>[] = [];
  for (const scenario of input.scenarios) {
    for (const candidate of input.candidates) {
      const output = await input.execute({ scenario, candidate });
      const score = await input.score({ scenario, candidate, output });
      results.push(Object.freeze({
        scenarioId: scenario.id,
        candidateId: candidate.id,
        output,
        score,
      }));
    }
  }
  return Object.freeze(results);
}

function assertUniqueNonEmptyIds(
  kind: "scenario" | "candidate",
  values: readonly { readonly id: string }[],
): void {
  if (values.length === 0) {
    throw new WHOXOSEvalKernelConfigurationError(`${kind} list must not be empty`);
  }
  const ids = new Set<string>();
  for (const value of values) {
    if (value.id.trim().length === 0) {
      throw new WHOXOSEvalKernelConfigurationError(`${kind} id must not be empty`);
    }
    if (ids.has(value.id)) {
      throw new WHOXOSEvalKernelConfigurationError(`duplicate ${kind} id: ${value.id}`);
    }
    ids.add(value.id);
  }
}
