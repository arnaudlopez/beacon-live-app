import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileWeatherStore } from './weatherStore.js';

const tempDirs = [];

async function makeStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'beacon-weather-store-'));
  tempDirs.push(dir);
  return join(dir, 'weather-state.json');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('file weather store contract', () => {
  it('persists the latest snapshot and observations across store instances', async () => {
    const filePath = await makeStorePath();
    const snapshot = {
      ts: '2026-05-25T08:00:20.000Z',
      windData: {
        porticcio: {
          live: {
            windSpeed: 16,
            windGust: 22,
            windDirection: 270,
          },
          history: [],
        },
      },
      surfData: {},
      waterData: null,
      sourceHealth: {
        windsup_porticcio: {
          status: 'ok',
          consecutiveFailures: 0,
          lastSuccessAt: '2026-05-25T08:00:20.000Z',
          lastErrorAt: null,
          lastErrorMessage: null,
          nextPollAt: '2026-05-25T08:00:40.000Z',
        },
      },
    };

    const store = createFileWeatherStore({ filePath });
    await store.saveSnapshot(snapshot);
    await store.appendObservation({
      sourceId: 'windsup_porticcio',
      observedAt: '2026-05-25T08:00:20.000Z',
      receivedAt: '2026-05-25T08:00:21.000Z',
      changed: true,
      payload: snapshot.windData.porticcio,
    });

    const freshStore = createFileWeatherStore({ filePath });
    const state = await freshStore.loadState();

    expect(state.snapshot).toEqual(snapshot);
    expect(state.observations).toEqual([
      {
        sourceId: 'windsup_porticcio',
        observedAt: '2026-05-25T08:00:20.000Z',
        receivedAt: '2026-05-25T08:00:21.000Z',
        changed: true,
        payload: snapshot.windData.porticcio,
      },
    ]);
  });
});
