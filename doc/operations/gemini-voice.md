# Gemini voice restored — 2026-09-29

Gemini is again the voice provider. Existing model selections remain in agent
metadata; Extended Thinking remains the default. Text agents keep their configured
runtime (including Codex). The restored voice session hook, Gemini route group,
connector catalog entry, and connection links replace the LiveKit integration.

LiveKit's local service units, cloud bridge, virtual environment, credentials,
application environment drop-in, source worker, route, and package dependencies
have been removed. The cloud account/project itself has not been deleted.

Gemini keys were deleted in the prior migration. Reconnect Gemini through
Connectors to create new credentials and agent grants. The application should
show a connection prompt until that is done. Do not restore deleted secret values
from backups or represent a live provider test as passed without a new key.

Validation: 118 focused UI/voice-route tests passed, UI typecheck and production
build passed. The API health endpoint is healthy after graceful deployment and
root-executor rebinding. Full repository regression was not performed.
