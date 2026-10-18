# WHOXOS Eval Kernel

`@whoxos/whoxos-eval-kernel` is the workspace-private, provider-neutral
matrix orchestrator owned by WHOXOS Evals. It contains no WHOXOS scenario
corpus, provider configuration, product fixture, scorer, or report template.

Consumers pass scenario and candidate values plus execution and scoring
callbacks. Candidate `preflight` hooks should call the runner package's
`assertWHOXOSRunnerCompatibility` before any provider work starts. This keeps
catalog, protocol, runner-client, control-plane-adapter, testkit, corpus, and
provider-operation incompatibilities explicit.

WHOXOS App may consume this package only as a development dependency for CI
or parity tests. `@whoxos/whoxos-runner` has no runtime dependency on it.
