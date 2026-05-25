import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

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

function normalizeState(value) {
  return {
    ...emptyState(),
    ...value,
    snapshot: value?.snapshot ?? null,
    observations: Array.isArray(value?.observations) ? value.observations : [],
    sourceHealth: value?.sourceHealth ?? value?.snapshot?.sourceHealth ?? {},
  };
}

export function createFileWeatherStore({ filePath }) {
  if (!filePath) {
    throw new Error('createFileWeatherStore requires a filePath');
  }

  async function loadState() {
    try {
      const payload = await readFile(filePath, 'utf8');
      return normalizeState(JSON.parse(payload));
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyState();
      throw error;
    }
  }

  async function writeState(state) {
    await mkdir(dirname(filePath), { recursive: true });
    const nextState = normalizeState(state);
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
      observations: [...state.observations, nextObservation],
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
