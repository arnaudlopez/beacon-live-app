# Beacon Live Real Node Adapters - Notes Needs Clarification

This LLM-first input is not ready for Ready Mode yet. DevLoop is stopping here because the spec is too light to drive tests without guessing.

## Why This Is Too Light

- There are no first tests, edge cases, or manual checks to drive implementation.

## Likely Misfire

If DevLoop starts now, the agent is likely to implement a plausible slice that feels productive but does not prove the owner outcome. The most likely failure is weak tests that validate generic behavior instead of the specific result you want.

## Missing Inputs

- acceptance_evidence

## Priority Questions

- Which user paths, edge cases, or checks should become first tests/evidence?

## Proposed Amended Spec

Use this as the next LLM-first draft. Fill the TODOs, delete what is wrong, and rerun DevLoop only after the oracle and acceptance evidence are concrete.

```md
# Beacon Live Real Node Adapters - Notes

## Intent

TODO: Visible outcome the owner expects at the end.

## Non-Goals

TODO: What must stay out of scope.

## Proposed Oracle

Beacon Live's Docker branch is ready for Portainer redeploy: weather-api uses real Node adapters when credentials are present, keeps demo fallback for no-secret smoke, exposes the same /api/* contract, passes tests/build/lint/smoke without external network calls, and DEPLOY_DOCKER.md plus .env.example list the exact Portainer credentials to add.

## Acceptance

- TODO: First behavior or artifact that must be proven.
- TODO: Edge case or failure mode that must be covered.
- TODO: Final manual, visual, source-backed, or shipping proof if relevant.

## Constraints

TODO: Boundaries, credentials, data safety, external services, or forbidden actions.
```

## Minimal Oracle Before Ready Mode

Beacon Live's Docker branch is ready for Portainer redeploy: weather-api uses real Node adapters when credentials are present, keeps demo fallback for no-secret smoke, exposes the same /api/* contract, passes tests/build/lint/smoke without external network calls, and DEPLOY_DOCKER.md plus .env.example list the exact Portainer credentials to add.

## Acceptance Evidence To Define

Acceptance evidence should be concrete enough to become the first test, check, artifact review, or manual proof.

- A first automated test, browser check, source-backed check, or artifact review that proves the main behavior.
- At least one edge case or failure mode.
- Any manual, visual, shipping, migration, or external-service proof needed for this type of work.

## Current Mode Hint

implementation

## Current Oracle Hint

Beacon Live's Docker branch is ready for Portainer redeploy: weather-api uses real Node adapters when credentials are present, keeps demo fallback for no-secret smoke, exposes the same /api/* contract, passes tests/build/lint/smoke without external network calls, and DEPLOY_DOCKER.md plus .env.example list the exact Portainer credentials to add.

## Next Step

Answer the questions above in the LLM conversation, then rerun:

```bash
llm-first-devloop interview --from notes.md --out brief.md
```

## Source Notes

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
> ## Acceptance Evidence
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
