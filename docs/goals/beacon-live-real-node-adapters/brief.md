# Beacon Live Real Node Adapters - Notes

## Intent

Make the current Docker realtime branch ready for the actual Portainer deployment by replacing demo-only backend data with real server-side weather adapters.

The owner wants to come back only when the project is ready to deploy and when the remaining action is to add credentials in Portainer.

Port the real upstream weather fetchers from the Supabase Edge Function into Node backend adapters so the Docker `weather-api` can provide real weather data once credentials are supplied in Portainer.

- Do not remove Supabase fallback code.
- Do not require credentials for automated tests.
- Do not call real external weather services in unit tests.
- Do not expose server-side API secrets to the browser.
- Do not change the dashboard UI.
- Do not mutate production data.
- Do not deploy from here.
- Do not commit `.claude/` or generated `.goalbuddy-board/` assets.

## Non-Goals

- TODO: Name what this goal must not change.

## Proposed Oracle

Beacon Live's Docker branch is ready for Portainer redeploy: weather-api uses real Node adapters when credentials are present, keeps demo fallback for no-secret smoke, exposes the same /api/* contract, passes tests/build/lint/smoke without external network calls, and DEPLOY_DOCKER.md plus .env.example list the exact Portainer credentials to add.

## Suggested Mode

implementation

## Acceptance Hints

- Red/green tests prove `createRealWeatherSources` builds the expected source list without external network calls.
- Red/green tests prove credential-gated behavior:
- Météo-France sources require `METEOFRANCE_KEY`;
- WindsUp requires `WINDSUP_USER` and `WINDSUP_PASS`;
- public sources can run without secrets.
- Red/green tests prove real adapters parse representative fixture payloads into the existing runtime payload shape.
- Service tests prove `WEATHER_SOURCE_MODE=real` wires real adapters into `weather-api`.
- Service tests prove `WEATHER_SOURCE_MODE=demo` still works for no-secret smoke.
- `docker compose config` proves Portainer-facing env variables are wired.
- `DEPLOY_DOCKER.md` and `.env.example` list exact variables to add in Portainer.
- `npm test`, targeted eslint, `npm run build`, `git diff --check`, and local `/api/health` smoke pass.

## Risks And Open Questions

- TODO: List ambiguity, missing credentials, operational risks, or decisions needed before implementation.

## Constraints

- TODO: Capture constraints, must-preserve behavior, boundaries, or forbidden changes.

## Ready Mode Command

```bash
npm run ready -- --from ./docs/goals/beacon-live-real-node-adapters/brief.md --mode implementation --oracle "Beacon Live's Docker branch is ready for Portainer redeploy: weather-api uses real Node adapters when credentials are present, keeps demo fallback for no-secret smoke, exposes the same /api/* contract, passes tests/build/lint/smoke without external network calls, and DEPLOY_DOCKER.md plus .env.example list the exact Portainer credentials to add." --out docs/goals/beacon-live-real-node-adapters-notes
```

## Source Notes

Compiled from: /Users/arnaud/Documents/beacon-live-app/docs/goals/beacon-live-real-node-adapters/notes.md

> # Beacon Live Real Node Adapters - Notes
> 
> ## Intent
> 
> Make the current Docker realtime branch ready for the actual Portainer deployment by replacing demo-only backend data with real server-side weather adapters.
> 
> The owner wants to come back only when the project is ready to deploy and when the remaining action is to add credentials in Portainer.
> 
> ## Current Deployment Context
> 
> - Portainer stack name: `beacon-live`.
> - Current production stack is deployed from `https://github.com/arnaudlopez/beacon-live-app.git`.
> - Current production has one container `beacon-live` on `9888:80`.
> - Current Portainer env vars:
>   - `VITE_SUPABASE_URL`
>   - `VITE_SUPABASE_ANON_KEY`
>   - `VITE_INFOCLIMAT_TOKEN`
> - The current branch `codex/beacon-live-docker-realtime-product` already adds:
>   - `weather-api` backend service;
>   - `/api/weather`, `/api/events`, `/api/health`;
>   - frontend `VITE_WEATHER_BACKEND_URL=/api`;
>   - SSE merge/fallback tests;
>   - Docker/Nginx proxy wiring;
>   - local JSON persistence;
>   - demo adapters for no-secret smoke.
> 
> ## Goal
> 
> Port the real upstream weather fetchers from the Supabase Edge Function into Node backend adapters so the Docker `weather-api` can provide real weather data once credentials are supplied in Portainer.
> 
> ## Non-Goals
> 
> - Do not remove Supabase fallback code.
> - Do not require credentials for automated tests.
> - Do not call real external weather services in unit tests.
> - Do not expose server-side API secrets to the browser.
> - Do not change the dashboard UI.
> - Do not mutate production data.
> - Do not deploy from here.
> - Do not commit `.claude/` or generated `.goalbuddy-board/` assets.
> 
> ## Required Behavior
> 
> - `weather-api` can run in real mode when credentials are present.
> - `weather-api` can still run in demo mode for no-secret local smoke.
> - Real adapters cover, at minimum:
>   - Météo-France stations already used by the app;
>   - Pioupiou `1202`;
>   - eSurfmar Ajaccio/Calvi;
>   - CANDHIS Revellata/Bonifacio;
>   - Wunderground stations already used by the app;
>   - WindsUp Porticcio when `WINDSUP_USER` and `WINDSUP_PASS` are present.
> - Missing optional credentials should mark/skip only the affected sources rather than crashing the service.
> - Poll intervals should respect the existing freshness target without hardcoding all sources to one cadence:
>   - fast sources can poll around 20-30s;
>   - slow sources should poll slower;
>   - no source should be polled faster than the backend is configured to support.
> - Tests should use mocked `fetch`.
> - Portainer docs should list exactly which environment variables to add.
> 
> ## Proposed Oracle
> 
> Beacon Live's Docker branch is ready for Portainer redeploy: `weather-api` uses real Node adapters when credentials are present, keeps demo fallback for no-secret smoke, exposes the same `/api/*` contract, passes tests/build/lint/smoke without external network calls, and `DEPLOY_DOCKER.md` plus `.env.example` list the exact Portainer credentials to add.
> 
> ## Acceptance
> 
> - Red/green tests prove `createRealWeatherSources` builds the expected source list without external network calls.
> - Red/green tests prove credential-gated behavior:
>   - Météo-France sources require `METEOFRANCE_KEY`;
>   - WindsUp requires `WINDSUP_USER` and `WINDSUP_PASS`;
>   - public sources can run without secrets.
> - Red/green tests prove real adapters parse representative fixture payloads into the existing runtime payload shape.
> - Service tests prove `WEATHER_SOURCE_MODE=real` wires real adapters into `weather-api`.
> - Service tests prove `WEATHER_SOURCE_MODE=demo` still works for no-secret smoke.
> - `docker compose config` proves Portainer-facing env variables are wired.
> - `DEPLOY_DOCKER.md` and `.env.example` list exact variables to add in Portainer.
> - `npm test`, targeted eslint, `npm run build`, `git diff --check`, and local `/api/health` smoke pass.
> 
> ## Suggested Implementation Order
> 
> 1. Add red tests for real adapter factory behavior and credential-gated source inclusion.
> 2. Implement Node real weather adapters with injectable fetch/clock/env for tests.
> 3. Wire `server/realtime/server.js` to choose real adapters when `WEATHER_SOURCE_MODE=real`, demo when `demo`, and sensible default behavior.
> 4. Update Docker Compose and docs with Portainer variables.
> 5. Run full verification and push the branch.
