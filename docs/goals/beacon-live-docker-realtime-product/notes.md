# Beacon Live Docker Realtime Product - Notes

## Intent

Turn the Beacon Live Docker realtime architecture into a working product path.

The final product should run a local Docker-ready backend that owns live weather collection, exposes snapshot and SSE endpoints, and lets the React dashboard receive fresh updates without depending on Supabase Realtime for the live path.

## User Goal

As the owner of Beacon Live, I want the dashboard to display the freshest possible wind/surf data, ideally within 30 seconds of upstream publication for fast sources, while avoiding Supabase live limits.

## Current Foundation

- `docs/goals/beacon-live-realtime-docker-golden-state/golden-state.md` defines the target architecture.
- `server/realtime/weatherRuntime.js` implements the core runtime.
- `server/realtime/weatherApiServer.js` exposes initial HTTP/SSE endpoints.
- Tests already prove:
  - changed payload broadcast;
  - unchanged payload suppression;
  - one-source failure isolation;
  - `/api/weather`;
  - `/api/health`;
  - `/api/events`.

## Non-Goals

- Do not remove Supabase code immediately.
- Do not delete existing dashboard components.
- Do not expose API secrets to the browser.
- Do not require live external API credentials for automated tests.
- Do not redesign the UI.
- Do not optimize unrelated lint failures unless they block product verification.
- Do not promise faster updates than upstream sources actually publish.
- Do not make Cloudflare the sub-minute collector.

## Proposed Oracle

Beacon Live runs with a Docker-ready local realtime backend that exposes `/api/weather`, `/api/events`, and `/api/health`, polls configured sources through adapters, persists local history, pushes fresh updates to the React dashboard over SSE, keeps Supabase as fallback only, and passes automated verification without external secrets.

## Acceptance

- Backend can run locally as a long-running service with fake/demo adapters and no external secrets.
- Backend exposes:
  - `GET /api/weather`;
  - `GET /api/events`;
  - `GET /api/health`.
- SSE emits `weather:update` when the runtime observes fresh source data.
- SSE includes heartbeat and an initial snapshot or equivalent recovery path.
- Backend has a persistence layer for current snapshot, source observations, and source health using a local durable store.
- Frontend hook can use the local backend via environment configuration.
- Frontend opens SSE and merges `weather:update` events into the existing dashboard state shape.
- Frontend falls back to existing Supabase hook or HTTP polling if the local backend/SSE is unavailable.
- Docker Compose includes the backend service and routes/proxies `/api/*` appropriately for local production deployment.
- Tests do not call real external weather services.
- Verification includes targeted backend tests, frontend hook tests, full `npm test`, build, targeted lint or documented existing lint blockers, and at least one local smoke check.

## Constraints

- Use existing source ids from `src/config/sources.js`.
- Preserve existing dashboard visual behavior.
- Keep Supabase fallback until the new path is proven.
- Keep all secrets server-side.
- Prefer small modules under `server/realtime/**`.
- Avoid adding fragile native dependencies unless necessary.
- Any persistence choice must work in Docker without complex build tooling.

## Suggested Implementation Order

1. Add scheduler/heartbeat/snapshot SSE behavior around existing runtime.
2. Add durable persistence with a Docker-friendly store.
3. Add demo/fake source adapters for local no-secret operation.
4. Add server entrypoint for long-running backend.
5. Add frontend hook for backend HTTP/SSE with Supabase fallback.
6. Add Docker Compose/Nginx proxy wiring.
7. Add docs and smoke verification.

## Acceptance Evidence

- Red/green tests for scheduler and SSE heartbeat/snapshot.
- Red/green tests for persistence.
- Red/green tests for frontend hook event merging/fallback.
- Docker/backend smoke command returns healthy `/api/health`.
- Build and test commands pass or blockers are explicitly documented.
