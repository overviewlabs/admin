# Admin Codex host access

Enabled the Admin-only cptr instance setting `admin.codex_root_access=true` at the user's request. The Codex adapter reads it on each invocation and, only when running with effective UID 0, uses full approval mode: `approvalPolicy=never`, `sandbox=danger-full-access`. It applies to new and resumed normal Codex threads, including chats that previously requested the default auto tool mode. Explicit planning and desktop modes retain their respective constraints. Standalone instances without the setting retain existing behavior.

The private Admin worker and its Codex app-server child run as root. WHOXOS remains unprivileged. Human instance-administrator and official-organization access checks remain unchanged; other organization agents were not granted Admin access.

Verification: an actual Admin Codex chat with ordinary `tool_approval_mode=auto` created and read a temporary file under `/root`, outside its workspace. External inspection verified contents, UID 0 ownership, and mode 0600. Test file and chat were removed. The worker was restarted within the existing WHOXOS supervisor to load the adapter change; WHOXOS remained active.

Disable this policy by setting `admin.codex_root_access=false` through the authenticated Admin config API. The setting is read on the next Codex invocation; disabling it does not interrupt already-running turns.
