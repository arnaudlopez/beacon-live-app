import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function emptyState() {
  return { subscriptions: [], updatedAt: null };
}

function normalizeState(value) {
  return {
    ...emptyState(),
    ...value,
    subscriptions: Array.isArray(value?.subscriptions) ? clone(value.subscriptions) : [],
  };
}

export function createFilePushStore({ filePath }) {
  if (!filePath) throw new Error('createFilePushStore requires a filePath');

  async function loadState() {
    try {
      return normalizeState(JSON.parse(await readFile(filePath, 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyState();
      throw error;
    }
  }

  async function saveState(state) {
    await mkdir(dirname(filePath), { recursive: true });
    const nextState = normalizeState(state);
    nextState.updatedAt = new Date().toISOString();
    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  }

  return { loadState, saveState };
}
