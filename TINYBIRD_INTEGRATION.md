# Tinybird State-Change Telemetry

Tinybird is connected as an asynchronous analytics mirror for every processed observation and accepted state mutation. SQLite remains NurserAI's source for canonical state, the append-only recovery log, and restart recovery. Tinybird delivery failures are logged and never block monitoring.

The stream contains event ID and time, session ID, event type, video timestamp, frame and situation IDs, state version, provider, processing latency, serialized working-state size, and the mutation JSON payload. It does not include raw frame content, image bytes, or full observation descriptions.

## Deploy the data source

The source schema is in [tinybird/datasources/nightwatch_state_changes.datasource](./tinybird/datasources/nightwatch_state_changes.datasource). From a workspace authenticated with the Tinybird CLI, deploy it:

```bash
tb push datasources/nightwatch_state_changes.datasource
```

The API token used by NurserAI needs `DATASOURCE:APPEND` permission for `nightwatch_state_changes`. The Events API requires an existing data source and append permission. The host must match your workspace's region.

## Configure the application

The current `.env` variable `TINY_BIRD_API` is accepted as the append token. `TINYBIRD_TOKEN` is also supported. Optional settings:

```dotenv
TINYBIRD_API_URL=https://api.tinybird.co
TINYBIRD_DATASOURCE=nightwatch_state_changes
```

Use your workspace's regional API host when it differs from the default. Restart the API after changing `.env`. The dashboard marks Tinybird **READY** while configured but before a successful write, **LIVE** after a successful Events API response, and **ERROR** if ingestion fails. A 403 means the token lacks append permission or the request is using a host for a different workspace region. Permanent 4xx errors pause further ingestion until the API restarts; transient failures retry after a short cooldown.

Current setup check: NurserAI found the configured `TINY_BIRD_API` token and attempted an event write, but Tinybird returned HTTP 403. No successful Tinybird ingestion has been confirmed yet. Check that the token is scoped to append to `nightwatch_state_changes` and set `TINYBIRD_API_URL` to the host shown for the workspace region.

Each sample is sent as one NDJSON batch containing its observation telemetry and any accepted mutations. With the default two-second sample interval, this keeps the demo comfortably below the Events API rate limits.
