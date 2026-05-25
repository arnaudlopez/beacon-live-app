# Acceptance Contract

## Goal

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

## LLM First Context

This contract assumes the exploratory LLM conversation has already happened. The goal now is to preserve that shared intent, not restart discovery from scratch.

## Observable Oracle

Beacon Live's Docker branch is ready for Portainer redeploy: weather-api uses real Node adapters when credentials are present, keeps demo fallback for no-secret smoke, exposes the same /api/* contract, passes tests/build/lint/smoke without external network calls, and DEPLOY_DOCKER.md plus .env.example list the exact Portainer credentials to add.

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
