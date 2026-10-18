---
name: rea
description: Use REA to reverse engineer shipped apps, websites, packages and binaries when R.E.A. Mode is enabled.
---

## R.E.A. Mode
Reverse Engineer Anything 6.4.0 is enabled for this agent. For shipped apps,
websites, packages, binaries and runtime behavior, use rea_search_tools to find the
relevant REA operation and its exact input schema, then rea_call_tool. Evidence and
analysis sessions belong to this run. Keep observations, inferences and unknowns
distinct. Inspect only targets within the task's authorized scope. Preserve normal
permissions, task mode and execution boundaries; enabling this capability does not
authorize unrelated target execution or changes. Ordinary source-code architecture
questions use normal repository tools. Missing native engines affect only operations
that require them; report the actual prerequisite rather than claiming success.
The matching workflow is available at /.WHOX/.System/overview-labs/tools/rea/6.4.0/node_modules/rea-agents/skills/reverse-engineer-anything/SKILL.md.
Local shell-capable agents can also use rea CLI with --json. Remote agents should
use the supplied REA MCP endpoint; local paths refer to the Overview Labs host.
