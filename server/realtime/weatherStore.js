import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_MAX_OBSERVATIONS = 500;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function emptyState() {
  return {
    snapshot: null,
    observations: [],
    sourceHealth: {},
    updatedAt: null,
  };
}

function normalizeMaxObservations(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_OBSERVATIONS;
}

function trimObservations(observations, maxObservations) {
  if (!Array.isArray(observations)) return [];
  return observations.slice(-maxObservations).map(compactObservation);
}

function compactPayload(payload) {
  if (payload === null || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload;

  const compact = {};
  if (payload.live !== undefined) compact.live = clone(payload.live);
  if (payload.surf !== undefined) compact.surf = clone(payload.surf);
  if (payload.waterTemp !== undefined) compact.waterTemp = payload.waterTemp;
  if (payload.height !== undefined) compact.height = payload.height;
  if (payload.hmax !== undefined) compact.hmax = payload.hmax;
  if (payload.period !== undefined) compact.period = payload.period;
  if (payload.direction !== undefined) compact.direction = payload.direction;
  if (payload.spread !== undefined) compact.spread = payload.spread;

  return Object.keys(compact).length > 0 ? compact : clone(payload);
}

function compactObservation(observation) {
  if (observation === null || typeof observation !== 'object') return observation;
  return {
    ...clone(observation),
    payload: compactPayload(observation.payload),
  };
}

function normalizeState(value, maxObservations = DEFAULT_MAX_OBSERVATIONS) {
  return {
    ...emptyState(),
    ...value,
    snapshot: value?.snapshot ?? null,
    observations: trimObservations(value?.observations, maxObservations),
    sourceHealth: value?.sourceHealth ?? value?.snapshot?.sourceHealth ?? {},
  };
}

export function createFileWeatherStore({ filePath, maxObservations = DEFAULT_MAX_OBSERVATIONS }) {
  if (!filePath) {
    throw new Error('createFileWeatherStore requires a filePath');
  }
  const observationLimit = normalizeMaxObservations(maxObservations);

  async function loadState() {
    try {
      const payload = await readFile(filePath, 'utf8');
      return normalizeState(JSON.parse(payload), observationLimit);
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyState();
      throw error;
    }
  }

  async function writeState(state) {
    await mkdir(dirname(filePath), { recursive: true });
    const nextState = normalizeState(state, observationLimit);
    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  }

  async function saveSnapshot(snapshot) {
    const state = await loadState();
    const nextSnapshot = clone(snapshot);
    await writeState({
      ...state,
      snapshot: nextSnapshot,
      sourceHealth: nextSnapshot?.sourceHealth ?? state.sourceHealth,
      updatedAt: nextSnapshot?.ts ?? new Date().toISOString(),
    });
  }

  async function appendObservation(observation) {
    const state = await loadState();
    const nextObservation = clone(observation);
    await writeState({
      ...state,
      observations: trimObservations([...state.observations, nextObservation], observationLimit),
      updatedAt: nextObservation?.receivedAt ?? new Date().toISOString(),
    });
  }

  async function recordSourceHealth(sourceId, health) {
    const state = await loadState();
    await writeState({
      ...state,
      sourceHealth: {
        ...state.sourceHealth,
        [sourceId]: clone(health),
      },
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    loadState,
    saveSnapshot,
    appendObservation,
    recordSourceHealth,
  };
}
