# LLM First Interview

## Intent

Add a new CANDHIS surf buoy to Beacon Live from:
https://candhis.cerema.fr/_public_/campagne.php?Y2FtcD0wMkIwNQ==

Decoded campaign id: `02B05`.
Campaign name: `Alistro`.
Dashboard id: `alistro`.

The owner outcome is that Alistro appears as a selectable surf buoy in the dashboard and receives fresh backend data through the existing realtime pipeline.

## Non-Goals

- Do not redesign the dashboard.
- Do not change polling cadence, storage retention, Docker, Portainer, or credential handling.
- Do not migrate data providers or rework the CANDHIS parser beyond what is required for campaign `02B05`.
- Do not touch unrelated untracked worktrees or local scratch files.

## Proposed Oracle

Backend includes CANDHIS campaign `02B05`, routes it into `surfData.alistro` under a stable dashboard source id, UI exposes the new surf buoy, and tests/build pass.

## Acceptance

- A source-backed check confirms CANDHIS campaign id `02B05` resolves to Alistro and the existing parser extracts current surf/water data.
- Unit tests prove real source creation includes `candhis_alistro`.
- Runtime tests prove `candhis_alistro` writes to `surfData.alistro` and does not leak into `windData`.
- Hook tests prove legacy/persisted backend snapshots can normalize `candhis_alistro` into `surfData`.
- UI tests prove `SurfWidget` renders an enabled Alistro selector and shows code `02B05` after selection.
- Release checks include targeted lint for changed files, full test suite, production build, and git diff whitespace check.

## Constraints

- Use the existing CANDHIS adapter and realtime backend architecture.
- Keep the change small and compatible with Portainer redeploy from GitHub.
- Do not require new credentials.
- Do not add new runtime dependencies.
