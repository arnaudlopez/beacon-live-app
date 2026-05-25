# Beacon Live Realtime Docker Golden State Needs Clarification

This LLM-first input is not ready for Ready Mode yet. DevLoop is stopping here because the spec is too light to drive tests without guessing.

## Why This Is Too Light

- The scope has no guardrails, so the agent could spend time on adjacent work.
- There are no first tests, edge cases, or manual checks to drive implementation.

## Likely Misfire

If DevLoop starts now, the agent is likely to implement a plausible slice that feels productive but does not prove the owner outcome. The most likely failure is weak tests that validate generic behavior instead of the specific result you want.

## Missing Inputs

- non_goals
- acceptance_evidence

## Priority Questions

- What should explicitly stay out of scope?
- Which user paths, edge cases, or checks should become first tests/evidence?

## Proposed Amended Spec

Use this as the next LLM-first draft. Fill the TODOs, delete what is wrong, and rerun DevLoop only after the oracle and acceptance evidence are concrete.

```md
# Beacon Live Realtime Docker Golden State

## Intent

TODO: Visible outcome the owner expects at the end.

## Non-Goals

TODO: What must stay out of scope.

## Proposed Oracle

Beacon Live runs with a Docker-ready local realtime backend that exposes /api/weather, /api/events, and /api/health, polls configured sources through adapters, persists local history, pushes fresh updates to the React dashboard over SSE, keeps Supabase as fallback only, and passes automated verification without external secrets.

## Acceptance

- TODO: First behavior or artifact that must be proven.
- TODO: Edge case or failure mode that must be covered.
- TODO: Final manual, visual, source-backed, or shipping proof if relevant.

## Constraints

TODO: Boundaries, credentials, data safety, external services, or forbidden actions.
```

## Minimal Oracle Before Ready Mode

Beacon Live runs with a Docker-ready local realtime backend that exposes /api/weather, /api/events, and /api/health, polls configured sources through adapters, persists local history, pushes fresh updates to the React dashboard over SSE, keeps Supabase as fallback only, and passes automated verification without external secrets.

## Acceptance Evidence To Define

Acceptance evidence should be concrete enough to become the first test, check, artifact review, or manual proof.

- A first automated test, browser check, source-backed check, or artifact review that proves the main behavior.
- At least one edge case or failure mode.
- Any manual, visual, shipping, migration, or external-service proof needed for this type of work.

## Current Mode Hint

implementation

## Current Oracle Hint

Beacon Live runs with a Docker-ready local realtime backend that exposes /api/weather, /api/events, and /api/health, polls configured sources through adapters, persists local history, pushes fresh updates to the React dashboard over SSE, keeps Supabase as fallback only, and passes automated verification without external secrets.

## Next Step

Answer the questions above in the LLM conversation, then rerun:

```bash
llm-first-devloop interview --from notes.md --out brief.md
```

## Source Notes

> # Beacon Live Realtime Docker Golden State
> 
> ## Outcome
> 
> Beacon Live should show fresh wind and surf data as soon as practical for a personal-use dashboard.
> 
> The target end state is a self-hosted Docker backend that continuously collects external weather data, stores a local history, and pushes updates to the React dashboard over Server-Sent Events.
> 
> The observable freshness target is:
> 
> - if an upstream fast source publishes a new value at time `T`, Beacon Live should display it by `T + 30s` under normal network conditions;
> - this target applies only to sources that actually publish at minute or sub-minute cadence;
> - slower sources are polled according to their real cadence, with short polling only near expected release windows.
> 
> ## Current Fit
> 
> The existing app already has the right separation point:
> 
> - `src/hooks/useWeatherData.js` owns the current live data transport.
> - `src/components/Dashboard.jsx` consumes normalized `windData`, `surfData`, `waterData`, `lastUpdated`, `error`, and `isRealtime`.
> - `src/config/sources.js` owns frontend source ids, labels, coordinates, and station metadata.
> - `supabase/functions/weather-cache/index.ts` owns source fetchers and normalizers that can be ported or adapted.
> 
> The golden state should preserve the UI data shape so charts, maps, widgets, and notifications do not need a broad rewrite.
> 
> ## Target Architecture
> 
> ```text
> External sources
>   |
>   | source-specific polling
>   v
> beacon-api Docker service
>   |
>   +-- source adapters
>   +-- scheduler and backoff
>   +-- stable payload hashing
>   +-- in-memory current snapshot
>   +-- SQLite history and source health
>   +-- SSE broadcaster
>   |
>   +-- GET /api/weather
>   +-- GET /api/events
>   +-- GET /api/health
>   v
> React PWA dashboard
>   |
>   +-- initial snapshot fetch
>   +-- EventSource update stream
>   +-- fallback polling after repeated SSE failure
> ```
> 
> Cloudflare can still sit in front of static assets or DNS, and Traefik can still terminate HTTPS, but the sub-minute collector should be the Docker service rather than Supabase Realtime or Cloudflare Cron.
> 
> ## Backend Service
> 
> The backend service is tentatively named `beacon-api`.
> 
> Responsibilities:
> 
> - poll each upstream source on a source-specific interval;
> - normalize upstream payloads into the existing dashboard shape;
> - compare stable hashes to detect real changes;
> - preserve the last good value when a source fails;
> - store current snapshot, observations, and source health locally;
> - broadcast changed payloads to connected dashboards;
> - expose health and diagnostics for personal operations.
> 
> Non-responsibilities for the first implementation:
> 
> - no frontend redesign;
> - no immediate Supabase deletion;
> - no live external polling in tests;
> - no public write endpoints;
> - no WebSocket unless SSE proves insufficient.
> 
> ## Source Strategy
> 
> Fast sources should be eligible for a 20-30 second polling interval:
> 
> - `meteofrance_20004002`
> - `meteofrance_20004003`
> - `windsup_porticcio`
> - `wunderground_IGROSS105`
> - `wunderground_ISARROLA7`
> - `wunderground_ICORSEPR2`
> - `wunderground_ISARTN1`
> - `wunderground_IBONIF6`
> - `pioupiou_1202`
> 
> Slower marine sources should not be blindly polled every 20 seconds:
> 
> - `candhis_revellata`
> - `candhis_bonifacio`
> - `esurfmar_ajaccio`
> - `esurfmar_calvi`
> 
> Initial cadence policy:
> 
> | Source group | Initial cadence | Notes |
> | --- | ---: | --- |
> | fast wind/live sources | 20-30s | Only after confirming the source tolerates this cadence. |
> | WindsUp | 30s with backoff | Scraping/auth fragility makes backoff mandatory. |
> | CANDHIS | 5-10min | Increase only if measured cadence proves it helps. |
> | eSurfmar | hourly-aware | Poll more frequently near expected release windows. |
> | archive/history endpoints | 5-15min | Live value freshness should not require archive refresh every tick. |
> 
> Each source adapter should expose:
> 
> ```js
> {
>   id: 'windsup_porticcio',
>   pollMs: 30000,
>   staleAfterMs: 90000,
>   fetch: async () => ({
>     source: 'windsup_porticcio',
>     observedAt: '2026-05-25T08:00:20.000Z',
>     payload: { live: {}, history: [] }
>   })
> }
> ```
> 
> ## Runtime Contract
> 
> The runtime core starts as a pure module, already represented by `server/realtime/weatherRuntime.js`.
> 
> It should provide:
> 
> - `createWeatherRuntime({ clock, sources })`
> - `runtime.pollDueSources()`
> - `runtime.getSnapshot()`
> - `runtime.subscribe(listener)`
> 
> Current implemented slice:
> 
> - polls due sources;
> - maps backend source ids to existing frontend wind source ids;
> - broadcasts `weather:update` only when normalized payload hash changes;
> - exposes `latencyMs` based on `observedAt`;
> - keeps last good snapshot visible when a source fails;
> - records per-source health.
> 
> Known current limitation:
> 
> - the first slice routes all changed payloads into `windData`; future work must add explicit routing for marine `surfData` and `waterData`.
> 
> ## REST API Contract
> 
> ### `GET /api/weather`
> 
> Returns the full snapshot for initial page load and recovery.
> 
> ```json
> {
>   "ts": "2026-05-25T08:00:30.000Z",
>   "windData": {
>     "porticcio": {
>       "live": {
>         "windSpeed": 14,
>         "windGust": 18,
>         "windDirection": 270
>       },
>       "history": []
>     }
>   },
>   "surfData": {
>     "revellata": null,
>     "bonifacio": null,
>     "ajaccio": null
>   },
>   "waterData": null,
>   "sourceHealth": {
>     "windsup_porticcio": {
>       "status": "ok",
>       "consecutiveFailures": 0,
>       "lastSuccessAt": "2026-05-25T08:00:30.000Z",
>       "lastErrorAt": null,
>       "lastErrorMessage": null,
>       "nextPollAt": "2026-05-25T08:01:00.000Z"
>     }
>   }
> }
> ```
> 
> ### `GET /api/events`
> 
> Returns an SSE stream.
> 
> Required headers:
> 
> ```http
> Content-Type: text/event-stream
> Cache-Control: no-cache, no-transform
> Connection: keep-alive
> ```
> 
> Event types:
> 
> - `weather:snapshot`
> - `weather:update`
> - `source:health`
> - `heartbeat`
> 
> Example update:
> 
> ```text
> event: weather:update
> data: {"sources":["windsup_porticcio"],"data":{"windData":{"porticcio":{"live":{"windSpeed":14}}}},"latencyMs":900}
> ```
> 
> ### `GET /api/health`
> 
> Returns operational state for the owner:
> 
> ```json
> {
>   "status": "ok",
>   "uptimeSec": 3600,
>   "sseClients": 2,
>   "sources": {
>     "windsup_porticcio": {
>       "status": "ok",
>       "lastSuccessAt": "2026-05-25T08:00:30.000Z",
>       "consecutiveFailures": 0,
>       "nextPollAt": "2026-05-25T08:01:00.000Z"
>     }
>   }
> }
> ```
> 
> ## Frontend Contract
> 
> The future frontend hook should preserve the public shape currently returned by `useWeatherData`:
> 
> ```js
> {
>   windData,
>   surfData,
>   waterData,
>   isLoading,
>   lastUpdated,
>   error,
>   isRealtime
> }
> ```
> 
> Flow:
> 
> 1. Fetch `/api/weather`.
> 2. Populate current dashboard state.
> 3. Open `new EventSource('/api/events')`.
> 4. Merge `weather:update` events into state.
> 5. Update `sourceHealth`-aware warnings without erasing last known good readings.
> 6. Use EventSource auto-reconnect.
> 7. If repeated SSE failures occur, fallback to `/api/weather` polling every 30-60 seconds.
> 
> This migration should be isolated behind a new or replacement data hook. The dashboard components should not need to know whether the data came from Supabase, Docker API, or fallback polling.
> 
> ## SQLite Persistence
> 
> SQLite should be used for local durability and simple operations.
> 
> Minimum schema:
> 
> ```sql
> CREATE TABLE current_snapshot (
>   id TEXT PRIMARY KEY,
>   payload_json TEXT NOT NULL,
>   updated_at TEXT NOT NULL
> );
> 
> CREATE TABLE source_observations (
>   id INTEGER PRIMARY KEY AUTOINCREMENT,
>   source TEXT NOT NULL,
>   observed_at TEXT,
>   fetched_at TEXT NOT NULL,
>   payload_hash TEXT NOT NULL,
>   payload_json TEXT NOT NULL
> );
> 
> CREATE INDEX idx_source_observations_source_time
> ON source_observations (source, observed_at);
> 
> CREATE TABLE source_health (
>   source TEXT PRIMARY KEY,
>   status TEXT NOT NULL,
>   last_success_at TEXT,
>   last_error_at TEXT,
>   last_error_message TEXT,
>   consecutive_failures INTEGER NOT NULL DEFAULT 0,
>   next_poll_at TEXT
> );
> ```
> 
> Retention policy:
> 
> - keep full observations for 48 hours by default;
> - compact or delete older rows on a low-priority cleanup interval;
> - do not block live polling on retention cleanup.
> 
> ## Freshness Timing Model
> 
> For fast sources:
> 
> ```text
> source publishes at T
> collector next poll occurs between T and T+pollMs
> normalization/hash/update occurs immediately
> SSE broadcast occurs immediately
> dashboard receives and merges event
> ```
> 
> If `pollMs <= 30_000`, and network/parse time is normal, visible latency is bounded by approximately:
> 
> ```text
> poll wait + fetch latency + parse latency + SSE delivery latency
> ```
> 
> The runtime test models this with:
> 
> - source poll interval: 20 seconds;
> - changed source observed at `08:00:20`;
> - emitted update latency: `<= 30_000`.
> 
> This does not prove external sources publish every minute. A later measurement task should collect observed update cadence per source before aggressive production polling is enabled everywhere.
> 
> ## Failure Modes
> 
> ### One source fails
> 
> Expected behavior:
> 
> - preserve last good value for that source;
> - mark only that source as `error`;
> - continue polling and broadcasting other sources;
> - expose the failure via `sourceHealth`.
> 
> ### Source unchanged
> 
> Expected behavior:
> 
> - do not broadcast `weather:update`;
> - do update health/fetched metadata if useful;
> - do not create duplicate history rows with the same hash unless an explicit audit mode requires it.
> 
> ### SSE disconnect
> 
> Expected behavior:
> 
> - browser EventSource reconnects automatically;
> - backend sends heartbeats to keep proxy connections alive;
> - client can refetch `/api/weather` after repeated failures.
> 
> ### Repeated upstream failures
> 
> Expected behavior:
> 
> - increase `consecutiveFailures`;
> - apply bounded exponential backoff;
> - keep last known good value visible;
> - avoid global dashboard failure unless all critical sources are stale.
> 
> ## Docker Deployment
> 
> Target compose shape:
> 
> ```yaml
> services:
>   beacon-api:
>     build:
>       context: .
>       dockerfile: server/Dockerfile
>     environment:
>       - METEOFRANCE_KEY
>       - WINDSUP_USER
>       - WINDSUP_PASS
>       - WUNDERGROUND_API_KEY
>       - BEACON_ALLOWED_ORIGINS
>     volumes:
>       - beacon-data:/data
>     restart: unless-stopped
> 
>   beacon-live:
>     build:
>       context: .
>     depends_on:
>       - beacon-api
> ```
> 
> Nginx or Traefik should route:
> 
> - `/` to the React static app;
> - `/api/weather`, `/api/events`, `/api/health` to `beacon-api`;
> - SSE proxy buffering must be disabled for `/api/events`.
> 
> ## Security
> 
> - No upstream credentials in frontend bundles.
> - No Supabase service role key in browser.
> - CORS allowlist should include production origin and local dev origins only.
> - Public endpoints are read-only.
> - `/api/health` should avoid exposing secrets or raw credential failure details.
> - If exposed publicly, add simple rate limiting at proxy or API layer.
> 
> ## Migration Plan
> 
> ### Phase 1: Golden state and contracts
> 
> - Author this document.
> - Keep DevLoop board and acceptance contract aligned.
> - Keep implementation behind tests.
> 
> ### Phase 2: Runtime core
> 
> - Implement pure runtime with fake sources and tests.
> - Current status: started with `server/realtime/weatherRuntime.js`.
> 
> ### Phase 3: HTTP/SSE server
> 
> - Add a local server layer around the runtime.
> - Test `/api/weather`, `/api/events`, `/api/health` with fake adapters.
> 
> ### Phase 4: SQLite store
> 
> - Add persistence behind a store interface.
> - Test current snapshot, observations, source health, and retention cleanup.
> 
> ### Phase 5: Source adapter parity
> 
> - Port existing source fetchers from Supabase Edge Function.
> - Keep adapters unit-testable with captured fixtures.
> - Measure real source cadence before final polling intervals.
> 
> ### Phase 6: Frontend hook migration
> 
> - Replace or add a hook using `/api/weather` and SSE.
> - Preserve dashboard component contracts.
> - Keep Supabase fallback until parity is proven.
> 
> ### Phase 7: Docker/Traefik hardening
> 
> - Add compose service.
> - Add persistent volume.
> - Configure reverse proxy for SSE.
> - Document rollback to Supabase-backed frontend.
> 
> ## Acceptance Checklist
> 
> - `golden-state.md` exists and documents architecture, timing, contracts, persistence, deployment, risks, and migration.
> - Runtime core tests cover:
>   - changed payload broadcast;
>   - unchanged payload suppression;
>   - one-source failure isolation;
>   - last-good snapshot preservation;
>   - `<=30s` timing model.
> - Later HTTP/SSE tests cover:
>   - `/api/weather` snapshot contract;
>   - `/api/events` event contract;
>   - heartbeat and reconnect behavior.
> - Later frontend tests cover:
>   - initial snapshot load;
>   - SSE merge behavior;
>   - fallback polling after repeated SSE failure.
> - Later deployment evidence proves:
>   - Docker service starts locally;
>   - SQLite persists across restart;
>   - SSE works behind the chosen proxy.
> 
> ## Open Decisions
> 
> - Whether the backend runtime should remain JavaScript or move to TypeScript.
> - Whether HTTP serving should use Fastify, Hono, Express, or native Node APIs.
> - Whether SQLite should use `better-sqlite3`, `sqlite`, or another library.
> - Whether Supabase fallback remains configurable after migration.
> - Which exact polling interval is safe for each upstream source after measurement.
> 
> ## Current Known Risks
> 
> - The repository currently has global lint failures unrelated to this goal.
> - The local branch is behind `origin/master`.
> - `.claude/` is untracked and unrelated.
> - WindsUp scraping/auth remains fragile and should be isolated behind adapter tests and backoff.
> - CANDHIS/eSurfmar likely do not benefit from sub-minute polling.
> - The current runtime slice does not yet implement surf/water routing, SQLite, HTTP, Docker, or frontend SSE.
