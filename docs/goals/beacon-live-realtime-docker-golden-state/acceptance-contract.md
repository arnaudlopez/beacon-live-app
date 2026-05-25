# Acceptance Contract

## Goal

# Beacon Live Realtime Docker Golden State - Notes

## Intent

Beacon Live is a personal-use maritime telemetry dashboard. The current Supabase-based live path is convenient but too heavy for the desired freshness: database requests, Edge Function requests, and Realtime connections grow with every open dashboard.

The target golden state is a self-hosted Docker backend that collects weather and marine data continuously, stores a local history, and pushes fresh updates to the React dashboard as soon as they are observed.

As the owner of Beacon Live, I want the dashboard to show new weather/wind/surf data within 30 seconds of the upstream source publishing it, while avoiding Supabase live limits and keeping operations understandable for personal use.

Supabase is healthy but not ideal for this product shape:

- Every browser session can create live backend load.
- Realtime creates persistent connections per open browser.
- Polling through an Edge Function can trigger database reads even when data has not changed.
- The app needs very fresh data, so long cache TTLs are not desirable.
- For personal use, a simple local collector is easier to reason about than a BaaS-style live system.

These are explicitly out of scope for this golden-state preparation goal:

- Do not migrate away from Supabase immediately.
- Do not delete Supabase code.
- Do not implement frontend changes during board preparation.
- Do not build a WebSocket system unless SSE is proven insufficient.
- Do not optimize UI design in this goal unless required by the data transport change.
- Do not commit to Cloudflare as the sub-minute collector.
- Do not expose new public endpoints before CORS/origin rules are designed.
- Do not store API secrets in frontend code or static assets.
- Do not promise exact upstream freshness beyond what the external sources actually publish.
- Do not tune aggressive polling per source until source update cadence is measured or documented.

## Non-Goals

- TODO: Name what this goal must not change.

## Proposed Oracle

A DevLoop board captures the Beacon Live Docker collector + SSE golden state with <=30s visible update latency acceptance evidence and no product implementation before approved boundaries.

## Suggested Mode

implementation

## Acceptance Hints

- Artifact review: `golden-state.md` describes the Docker collector + SSE + SQLite target architecture in enough detail for implementation without guessing.
- Timing evidence: the design contains a timing model proving that 20-30s collector polling plus immediate SSE broadcast can make a source update visible within 30s under normal network conditions.
- Contract evidence: the design defines `GET /api/weather`, `GET /api/events`, SSE event types, payload merge behavior, and fallback behavior when SSE disconnects.
- Storage evidence: the design defines the SQLite persistence model for current snapshot, source observations, and source health.
- Failure-mode evidence: the design covers at least these edge cases: one source fails while others continue, SSE reconnects after a disconnect, stale values remain visible with health metadata, and repeated upstream failures trigger backoff.
- Scope evidence: DevLoop creates a board that starts with design/acceptance-contract work and does not allow production implementation until a later task explicitly approves boundaries.
- Acceptance evidence must be concrete, reviewable, and limited to design/board preparation for this goal.
- Required evidence for this golden-state preparation:
- `docs/goals/beacon-live-realtime-docker-golden-state/golden-state.md` exists and describes the complete target architecture.
- The golden-state document contains:
- target architecture diagram or equivalent text flow;
- source polling strategy;
- SSE event contract;
- REST API contract;
- SQLite persistence model;
- deployment model;
- migration phases;
- risks and tradeoffs.
- The acceptance contract explicitly states the freshness target:
- new upstream data should be visible on the dashboard within 30 seconds under normal network conditions;
- evidence can initially be a documented timing model, then later an automated/local integration test during implementation.
- The DevLoop board exists and splits work into safe phases:
- design;
- backend prototype;
- source parity;
- frontend integration;
- deployment hardening.
- The first active task does not edit production frontend/backend code unless the board explicitly allows that boundary.
- The goal is done when the repository contains a reviewed golden-state design and an implementation plan that an agent can execute safely, with clear stop rules before product code changes.
- Observable proof:
- A GoalBuddy/DevLoop board exists under `docs/goals/beacon-live-realtime-docker-golden-state`.
- The board defines acceptance criteria for <=30s visible update latency.
- The board separates design, backend prototype, source parity, frontend integration, and hardening.
- No product implementation is started before the active task allows it.

## Risks And Open Questions

- Should the backend be Node, Bun, or Go? Initial preference: Node because the existing parsers are TypeScript/JavaScript-like and can be ported fastest.
- Should frontend and backend be one container or two? Initial preference: two services for clearer operations.
- Which sources truly update every minute versus hourly? Need measurement before setting aggressive polling for every source.
- Should Cloudflare remain in front as CDN/proxy only? Initial preference: yes, but not as the sub-minute collector.

## Constraints

- TODO: Capture constraints, must-preserve behavior, boundaries, or forbidden changes.

## Ready Mode Command

```bash
npm run ready -- --from ./docs/goals/beacon-live-realtime-docker-golden-state/brief.md --mode implementation --oracle "A DevLoop board captures the Beacon Live Docker collector + SSE golden state with <=30s visible update latency acceptance evidence and no product implementation before approved boundaries." --out docs/goals/beacon-live-realtime-docker-golden-state-notes
```

## Source Notes

Compiled from: /Users/arnaud/Documents/beacon-live-app/docs/goals/beacon-live-realtime-docker-golden-state/notes.md

> # Beacon Live Realtime Docker Golden State - Notes
> 
> ## Intent
> 
> Beacon Live is a personal-use maritime telemetry dashboard. The current Supabase-based live path is convenient but too heavy for the desired freshness: database requests, Edge Function requests, and Realtime connections grow with every open dashboard.
> 
> The target golden state is a self-hosted Docker backend that collects weather and marine data continuously, stores a local history, and pushes fresh updates to the React dashboard as soon as they are observed.
> 
> ## User Goal
> 
> As the owner of Beacon Live, I want the dashboard to show new weather/wind/surf data within 30 seconds of the upstream source publishing it, while avoiding Supabase live limits and keeping operations understandable for personal use.
> 
> ## Current System Summary
> 
> - Frontend: Vite + React PWA.
> - Current live backend: Supabase Edge Function `weather-cache`.
> - Current storage/cache: Supabase Postgres table `weather_cache`.
> - Current realtime behavior: optional/previous Supabase Realtime table updates.
> - Sources currently modeled:
>   - Meteo-France wind stations.
>   - WindsUp Porticcio.
>   - Wunderground stations.
>   - Pioupiou / OpenWindMap-like source.
>   - CANDHIS marine buoys.
>   - eSurfmar buoys.
> - Existing UI expects normalized `windData`, `surfData`, `waterData`, histories, and station metadata.
> 
> ## Problem Statement
> 
> Supabase is healthy but not ideal for this product shape:
> 
> - Every browser session can create live backend load.
> - Realtime creates persistent connections per open browser.
> - Polling through an Edge Function can trigger database reads even when data has not changed.
> - The app needs very fresh data, so long cache TTLs are not desirable.
> - For personal use, a simple local collector is easier to reason about than a BaaS-style live system.
> 
> ## Golden State Architecture
> 
> ```text
> React PWA
>   |
>   | GET /api/weather       initial snapshot and recovery
>   | GET /api/events        SSE stream for server-pushed updates
>   v
> beacon-api Docker service
>   |
>   +-- in-memory current snapshot
>   +-- SQLite history database
>   +-- source pollers
>   +-- update broadcaster
>   |
>   +-- Meteo-France
>   +-- WindsUp
>   +-- Wunderground
>   +-- Pioupiou
>   +-- CANDHIS
>   +-- eSurfmar
> ```
> 
> ## Core Design
> 
> ### Backend Service
> 
> Create a Dockerized backend service, tentatively named `beacon-api`.
> 
> Responsibilities:
> 
> - Poll upstream data sources on source-specific schedules.
> - Normalize all source payloads into the existing frontend shape.
> - Keep a current in-memory snapshot for fast reads.
> - Persist observations and source health in SQLite.
> - Broadcast changed source payloads to connected dashboards over Server-Sent Events.
> - Expose a simple HTTP API for initial load, health, diagnostics, and recovery.
> 
> ### Transport To Frontend
> 
> Use Server-Sent Events first, not WebSocket.
> 
> Reason:
> 
> - Beacon Live mostly needs server-to-client pushes.
> - SSE has built-in browser reconnection.
> - SSE is simpler behind Nginx/Traefik.
> - WebSocket can be added later only if bidirectional dashboard commands become necessary.
> 
> Frontend flow:
> 
> 1. Fetch `GET /api/weather` on app load.
> 2. Open `EventSource('/api/events')`.
> 3. Merge `weather:update` events into the existing React state.
> 4. If SSE disconnects, keep the last snapshot visible and reconnect automatically.
> 5. If reconnect fails repeatedly, fallback to polling `GET /api/weather` every 30-60 seconds.
> 
> ### Data Freshness Target
> 
> Primary target:
> 
> - If an upstream source publishes a new value at time `T`, Beacon Live should display it by `T + 30s` under normal network conditions.
> 
> Implementation implication:
> 
> - Fast sources should poll every 20 seconds or every 30 seconds.
> - Slower marine sources should poll according to known update cadence to avoid waste.
> - The collector should broadcast only when normalized data changes, not on every polling tick.
> 
> Suggested initial source cadence:
> 
> - Meteo-France: 30s polling, because observations can update frequently.
> - WindsUp: 30s polling, but with backoff if blocked or unchanged.
> - Wunderground fast stations: 30s polling.
> - Pioupiou: 30s polling for live, slower for archive.
> - CANDHIS: 5-10min polling unless evidence shows faster updates.
> - eSurfmar: align to known hourly update windows, with short polling near expected release times.
> 
> ### Storage
> 
> Use SQLite for local durability.
> 
> Minimum tables:
> 
> - `current_snapshot`
>   - `id`
>   - `payload_json`
>   - `updated_at`
> - `source_observations`
>   - `source`
>   - `observed_at`
>   - `fetched_at`
>   - `payload_json`
>   - `payload_hash`
> - `source_health`
>   - `source`
>   - `last_success_at`
>   - `last_error_at`
>   - `last_error_message`
>   - `consecutive_failures`
>   - `next_poll_at`
> 
> History retention:
> 
> - Keep full raw/normalized observations for 48h to start.
> - Optionally compact older data into hourly summaries later.
> 
> ### API Contract
> 
> `GET /api/weather`
> 
> Returns the complete normalized dashboard payload:
> 
> ```json
> {
>   "ts": "2026-05-25T08:30:00.000Z",
>   "windData": {},
>   "surfData": {},
>   "waterData": {},
>   "sourceHealth": {}
> }
> ```
> 
> `GET /api/events`
> 
> SSE stream.
> 
> Event types:
> 
> - `weather:snapshot` for initial stream sync if needed.
> - `weather:update` when one or more sources changed.
> - `source:health` when a source changes health state.
> - `heartbeat` every 15-30 seconds to keep proxies alive.
> 
> `GET /api/health`
> 
> Returns service health, poller state, latest successful fetch by source, and connected SSE clients count.
> 
> ### Update Detection
> 
> For each normalized source payload:
> 
> 1. Create a stable JSON representation.
> 2. Hash it.
> 3. Compare with previous hash.
> 4. If changed:
>    - update memory snapshot;
>    - persist observation;
>    - broadcast `weather:update`.
> 
> This prevents unnecessary frontend renders and unnecessary history rows.
> 
> ### Error Handling
> 
> - If a source fetch fails, preserve the last known good value.
> - Mark source stale after a source-specific threshold.
> - Use exponential backoff for repeated failures.
> - Do not let one source failure block other source pollers.
> - Surface source health in diagnostics rather than replacing all dashboard data with a global failure.
> 
> ### Deployment Golden State
> 
> Docker Compose should run:
> 
> - `beacon-api`
> - existing frontend/Nginx container or integrated static serving
> - optional reverse proxy through existing Traefik
> 
> Persistent volume:
> 
> - `/data/beacon-live.sqlite`
> 
> Configuration via environment:
> 
> - source credentials and API keys;
> - source polling intervals;
> - retention window;
> - SSE heartbeat interval;
> - CORS/origin allowlist.
> 
> ### Security And Operations
> 
> - No upstream API secrets in frontend bundles.
> - No service role keys in browser.
> - CORS should allow only the production dashboard origin and localhost development origins.
> - Add structured logs per source fetch.
> - Add health endpoint for simple monitoring.
> - Add graceful shutdown so SQLite and SSE clients close cleanly.
> - Add a rate limit on HTTP API endpoints if exposed publicly.
> 
> ## Migration Strategy
> 
> Phase 1: Design and contracts
> 
> - Freeze API payload shape.
> - Define source poller interface.
> - Define SQLite schema.
> - Define frontend hook contract.
> 
> Phase 2: Backend prototype
> 
> - Implement Docker service with in-memory snapshot and one or two representative sources.
> - Add `/api/weather`, `/api/events`, `/api/health`.
> - Verify SSE delivery locally.
> 
> Phase 3: Full source parity
> 
> - Port all existing source parsers from Supabase Edge Function.
> - Add source health and backoff.
> - Add SQLite persistence and history.
> 
> Phase 4: Frontend integration
> 
> - Replace Supabase live hook with API + SSE hook.
> - Keep Supabase fallback only if explicitly desired.
> - Preserve existing dashboard visuals and station selection behavior.
> 
> Phase 5: Production hardening
> 
> - Docker Compose and Traefik config.
> - Retention cleanup job.
> - Observability.
> - Document restore/restart operations.
> 
> ## Acceptance
> 
> - Artifact review: `golden-state.md` describes the Docker collector + SSE + SQLite target architecture in enough detail for implementation without guessing.
> - Timing evidence: the design contains a timing model proving that 20-30s collector polling plus immediate SSE broadcast can make a source update visible within 30s under normal network conditions.
> - Contract evidence: the design defines `GET /api/weather`, `GET /api/events`, SSE event types, payload merge behavior, and fallback behavior when SSE disconnects.
> - Storage evidence: the design defines the SQLite persistence model for current snapshot, source observations, and source health.
> - Failure-mode evidence: the design covers at least these edge cases: one source fails while others continue, SSE reconnects after a disconnect, stale values remain visible with health metadata, and repeated upstream failures trigger backoff.
> - Scope evidence: DevLoop creates a board that starts with design/acceptance-contract work and does not allow production implementation until a later task explicitly approves boundaries.
> 
> ## Acceptance Evidence
> 
> Acceptance evidence must be concrete, reviewable, and limited to design/board preparation for this goal.
> 
> Required evidence for this golden-state preparation:
> 
> 1. `docs/goals/beacon-live-realtime-docker-golden-state/golden-state.md` exists and describes the complete target architecture.
> 2. The golden-state document contains:
>    - target architecture diagram or equivalent text flow;
>    - source polling strategy;
>    - SSE event contract;
>    - REST API contract;
>    - SQLite persistence model;
>    - deployment model;
>    - migration phases;
>    - risks and tradeoffs.
> 3. The acceptance contract explicitly states the freshness target:
>    - new upstream data should be visible on the dashboard within 30 seconds under normal network conditions;
>    - evidence can initially be a documented timing model, then later an automated/local integration test during implementation.
> 4. The DevLoop board exists and splits work into safe phases:
>    - design;
>    - backend prototype;
>    - source parity;
>    - frontend integration;
>    - deployment hardening.
> 5. The first active task does not edit production frontend/backend code unless the board explicitly allows that boundary.
> 
> The goal is done when the repository contains a reviewed golden-state design and an implementation plan that an agent can execute safely, with clear stop rules before product code changes.
> 
> Observable proof:
> 
> - A GoalBuddy/DevLoop board exists under `docs/goals/beacon-live-realtime-docker-golden-state`.
> - The board defines acceptance criteria for <=30s visible update latency.
> - The board separates design, backend prototype, source parity, frontend integration, and hardening.
> - No product implementation is started before the active task allows it.
> 
> ## Non-Goals
> 
> These are explicitly out of scope for this golden-state preparation goal:
> 
> - Do not migrate away from Supabase immediately.
> - Do not delete Supabase code.
> - Do not implement frontend changes during board preparation.
> - Do not build a WebSocket system unless SSE is proven insufficient.
> - Do not optimize UI design in this goal unless required by the data transport change.
> - Do not commit to Cloudflare as the sub-minute collector.
> - Do not expose new public endpoints before CORS/origin rules are designed.
> - Do not store API secrets in frontend code or static assets.
> - Do not promise exact upstream freshness beyond what the external sources actually publish.
> - Do not tune aggressive polling per source until source update cadence is measured or documented.
> 
> ## Key Open Questions
> 
> - Should the backend be Node, Bun, or Go? Initial preference: Node because the existing parsers are TypeScript/JavaScript-like and can be ported fastest.
> - Should frontend and backend be one container or two? Initial preference: two services for clearer operations.
> - Which sources truly update every minute versus hourly? Need measurement before setting aggressive polling for every source.
> - Should Cloudflare remain in front as CDN/proxy only? Initial preference: yes, but not as the sub-minute collector.

## LLM First Context

This contract assumes the exploratory LLM conversation has already happened. The goal now is to preserve that shared intent, not restart discovery from scratch.

## Observable Oracle

A DevLoop board captures the Beacon Live Docker collector + SSE golden state with <=30s visible update latency acceptance evidence and no product implementation before approved boundaries.

## Visible Outcome

T001/T002 must replace this placeholder with the observable user-facing behavior, generated artifact, audit answer, or verification result that should exist at the end.

## Acceptance Tests To Write First

- Given the clarified spec, when the owner exercises the main path, then the visible outcome matches the requested behavior.
- Given an important edge case from the spec, when the code handles it, then the result is deterministic and documented.
- Given a likely failure mode, when the implementation is incomplete, then a targeted test fails before production code is changed.

## Failure Modes To Prevent

- Implementation starts before the acceptance/evidence contract is specific enough.
- Tests pass but do not prove the owner-visible outcome.
- The work drifts outside the LLM-first intent, non-goals, or approved boundaries.
- Operational risks such as migrations, env/secrets, auth, external services, or shipping proof are discovered but not handled.

## Manual Or Visual Proof If Needed

If code tests cannot fully prove the outcome, T001/T002 must define the manual, artifact, source-backed, or browser proof required before final audit.

## Out Of Scope

T001/T002 must keep or revise this list:

- Do not implement behavior outside the approved acceptance contract.
- Do not change unrelated dirty files.
- Do not skip the red test stage because implementation seems obvious.

## Shipping Proof

- T998 must record commit SHA, remote branch or push string, push result, committed files, and unrelated dirty files left untouched.

## End-State Evidence To Produce

- Product behavior or artifact visible to the owner.
- Acceptance tests that fail before implementation and pass after implementation.
- Verification commands with results.
- Design review mapped back to the original request.
- Commit and push proof, or an explicit shipping blocker such as `no_git_repository` or `no_github_remote`.

## Acceptance Or Evidence Draft

T001 must replace this draft with concrete tests after reading the target repository.

- Given the clarified spec, when the owner exercises the main path, then the visible outcome matches the requested behavior.
- Given an important edge case from the spec, when the code handles it, then the result is deterministic and documented.
- Given a likely failure mode, when the implementation is incomplete, then a targeted test fails before production code is changed.

## Visual Or Demo Oracle

If the goal has UI, T001/T002 must decide whether browser or screenshot evidence is required before Worker work starts.

## Non-Goals

T001/T002 must keep or revise this list:

- Do not implement behavior outside the approved acceptance contract.
- Do not change unrelated dirty files.
- Do not skip the red test stage because implementation seems obvious.
