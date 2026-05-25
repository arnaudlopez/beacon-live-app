# Beacon Live API HTTP/SSE Slice - Notes

## Intent

Continue the Beacon Live realtime Docker golden state by implementing the next smallest useful backend slice: a local HTTP/SSE server around the already-tested weather runtime core.

This slice should prove the backend can expose:

- `GET /api/weather` for full snapshot recovery;
- `GET /api/events` for Server-Sent Events updates;
- `GET /api/health` for basic runtime diagnostics.

As the owner of Beacon Live, I want the future Docker backend to push fresh source updates to the dashboard through a real SSE endpoint, so the frontend can later move away from Supabase Realtime while keeping the current dashboard data shape.

- Do not use real Meteo-France, WindsUp, Wunderground, Pioupiou, CANDHIS, or eSurfmar endpoints.
- Do not add API credentials or secrets.
- Do not implement SQLite persistence yet.
- Do not change frontend hooks or dashboard components.
- Do not change Docker, Nginx, or deployment files in this slice.
- Do not delete Supabase code or dependencies.
- Do not fix unrelated global lint failures unless a separate task explicitly authorizes it.

## Non-Goals

- TODO: Name what this goal must not change.

## Proposed Oracle

HTTP/SSE tests prove a local Beacon API server exposes /api/weather, /api/events, and /api/health, emits weather:update when the runtime observes a fresh source value, and preserves the dashboard payload shape without external services.

## Suggested Mode

implementation

## Acceptance Hints

- A test starts the API server with fake source adapters and a fake clock.
- `GET /api/weather` returns JSON with `ts`, `windData`, `surfData`, `waterData`, and `sourceHealth`.
- `GET /api/health` returns JSON with service status and per-source health.
- `GET /api/events` returns `text/event-stream`.
- After the fake source changes and the runtime polls, the SSE stream emits a `weather:update` event.
- The emitted event includes the mapped frontend source id, for example `windData.porticcio` for `windsup_porticcio`.
- No test performs live external network calls.

## Risks And Open Questions

- TODO: List ambiguity, missing credentials, operational risks, or decisions needed before implementation.

## Constraints

- Keep implementation dependency-light; prefer Node built-in HTTP primitives unless there is a strong reason to add a framework.
- Keep the API server separable from Docker and frontend migration.
- Preserve the existing runtime tests.
- Do not require real timers for the freshness check.
- Do not broaden scope beyond the server adapter around the runtime.

## Ready Mode Command

```bash
npm run ready -- --from ./docs/goals/beacon-live-api-http-sse-slice/brief.md --mode implementation --oracle "HTTP/SSE tests prove a local Beacon API server exposes /api/weather, /api/events, and /api/health, emits weather:update when the runtime observes a fresh source value, and preserves the dashboard payload shape without external services." --out docs/goals/beacon-live-api-http-sse-slice-notes
```

## Source Notes

Compiled from: /Users/arnaud/Documents/beacon-live-app/docs/goals/beacon-live-api-http-sse-slice/notes.md

> # Beacon Live API HTTP/SSE Slice - Notes
> 
> ## Intent
> 
> Continue the Beacon Live realtime Docker golden state by implementing the next smallest useful backend slice: a local HTTP/SSE server around the already-tested weather runtime core.
> 
> This slice should prove the backend can expose:
> 
> - `GET /api/weather` for full snapshot recovery;
> - `GET /api/events` for Server-Sent Events updates;
> - `GET /api/health` for basic runtime diagnostics.
> 
> ## User Goal
> 
> As the owner of Beacon Live, I want the future Docker backend to push fresh source updates to the dashboard through a real SSE endpoint, so the frontend can later move away from Supabase Realtime while keeping the current dashboard data shape.
> 
> ## Current State
> 
> - `docs/goals/beacon-live-realtime-docker-golden-state/golden-state.md` defines the architecture.
> - `server/realtime/weatherRuntime.js` implements the pure runtime core.
> - `server/realtime/weatherRuntime.test.js` covers:
>   - changed payload broadcast;
>   - unchanged payload suppression;
>   - one-source failure isolation;
>   - last-good snapshot preservation;
>   - <=30s latency model.
> 
> ## Scope
> 
> Implement a server layer that wraps the runtime with deterministic local/fake sources only.
> 
> The slice may add code under `server/realtime/**`.
> 
> The slice may add tests under `server/realtime/**`.
> 
> ## Non-Goals
> 
> - Do not use real Meteo-France, WindsUp, Wunderground, Pioupiou, CANDHIS, or eSurfmar endpoints.
> - Do not add API credentials or secrets.
> - Do not implement SQLite persistence yet.
> - Do not change frontend hooks or dashboard components.
> - Do not change Docker, Nginx, or deployment files in this slice.
> - Do not delete Supabase code or dependencies.
> - Do not fix unrelated global lint failures unless a separate task explicitly authorizes it.
> 
> ## Proposed Oracle
> 
> HTTP/SSE tests prove a local Beacon API server exposes `/api/weather`, `/api/events`, and `/api/health`, emits a `weather:update` SSE event when the runtime observes a fresh source value, and preserves the existing dashboard payload shape without external services.
> 
> ## Acceptance
> 
> - A test starts the API server with fake source adapters and a fake clock.
> - `GET /api/weather` returns JSON with `ts`, `windData`, `surfData`, `waterData`, and `sourceHealth`.
> - `GET /api/health` returns JSON with service status and per-source health.
> - `GET /api/events` returns `text/event-stream`.
> - After the fake source changes and the runtime polls, the SSE stream emits a `weather:update` event.
> - The emitted event includes the mapped frontend source id, for example `windData.porticcio` for `windsup_porticcio`.
> - No test performs live external network calls.
> 
> ## Constraints
> 
> - Keep implementation dependency-light; prefer Node built-in HTTP primitives unless there is a strong reason to add a framework.
> - Keep the API server separable from Docker and frontend migration.
> - Preserve the existing runtime tests.
> - Do not require real timers for the freshness check.
> - Do not broaden scope beyond the server adapter around the runtime.
> 
> ## Suggested First Test
> 
> `server/realtime/weatherApiServer.test.js`
> 
> Expected behavior:
> 
> 1. Create a fake clock and fake source.
> 2. Create runtime with `createWeatherRuntime`.
> 3. Create API server with `createWeatherApiServer`.
> 4. Assert `/api/weather` snapshot shape.
> 5. Open `/api/events`.
> 6. Trigger `runtime.pollDueSources()`.
> 7. Assert the SSE stream receives `event: weather:update`.
> 
> ## Verification
> 
> - `npm test -- server/realtime/weatherApiServer.test.js`
> - `npm test -- server/realtime/weatherRuntime.test.js`
> - `npm test`
> - `npx eslint server/realtime/weatherRuntime.js server/realtime/weatherRuntime.test.js server/realtime/weatherApiServer.js server/realtime/weatherApiServer.test.js`
> - `npm run build`
> - `git diff --check`
