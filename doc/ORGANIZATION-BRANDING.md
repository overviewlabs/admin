# Organization branding

Onboarding greetings use the organization name supplied by the company-scoped issue creation route. The greeting template must use `{{organizationName}}`, never a fixed platform or customer name. Missing names fall back to “your organization.”

The built-in coordination, board, planning, and hiring skills are named WHOXOS, WHOX-board, WHOX-converting-plans-to-tasks, and WHOX-create-agent. Their existing canonical keys and source directory slugs remain stable so assignments, pinned versions, API headers, and script references stay compatible. Both skill discovery paths expose the WHOXOS runtime names; requested WHOXOS names resolve to the existing canonical keys. Public skill downloads accept the new names and legacy aliases.

Platform prose uses WHOXOS. Agent instruction templates distinguish the platform from the agent's own organization. Existing managed instruction files and deterministic onboarding greetings can be updated with backups and organization-scoped audit entries; arbitrary user-authored conversation history must not be rewritten.
