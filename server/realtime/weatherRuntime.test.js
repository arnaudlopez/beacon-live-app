import { describe, expect, it, vi } from 'vitest';
import { createWeatherRuntime } from './weatherRuntime.js';

function makeClock(start = '2026-05-25T08:00:00.000Z') {
  let now = new Date(start).getTime();
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
      return now;
    },
  };
}

function reading(source, observedAt, value) {
  return {
    source,
    observedAt,
    payload: {
      live: {
        windSpeed: value,
        windGust: value + 4,
        windDirection: 270,
      },
      history: [
        {
          time: observedAt,
          avgSpeed: value,
          maxGust: value + 4,
          windDirection: 270,
        },
      ],
    },
  };
}

describe('weather runtime realtime contract', () => {
  it('pushes a weather:update event when a fast source publishes a new value within the 30s freshness budget', async () => {
    const clock = makeClock();
    const source = {
      id: 'windsup_porticcio',
      pollMs: 20_000,
      fetch: vi
        .fn()
        .mockResolvedValueOnce(reading('windsup_porticcio', '2026-05-25T08:00:00.000Z', 10))
        .mockResolvedValueOnce(reading('windsup_porticcio', '2026-05-25T08:00:20.000Z', 14)),
    };
    const runtime = createWeatherRuntime({ clock, sources: [source] });
    const events = [];

    runtime.subscribe((event) => events.push(event));

    await runtime.pollDueSources();
    clock.advance(20_000);
    await runtime.pollDueSources();

    const update = events.filter((event) => event.type === 'weather:update').at(-1);
    expect(update).toMatchObject({
      type: 'weather:update',
      sources: ['windsup_porticcio'],
    });
    expect(update.data.windData.porticcio.live.windSpeed).toBe(14);
    expect(update.latencyMs).toBeLessThanOrEqual(30_000);
  });

  it('does not broadcast unchanged payloads on every polling tick', async () => {
    const clock = makeClock();
    const unchanged = reading('meteofrance_20004003', '2026-05-25T08:00:00.000Z', 8);
    const source = {
      id: 'meteofrance_20004003',
      pollMs: 20_000,
      fetch: vi.fn().mockResolvedValue(unchanged),
    };
    const runtime = createWeatherRuntime({ clock, sources: [source] });
    const events = [];

    runtime.subscribe((event) => events.push(event));

    await runtime.pollDueSources();
    clock.advance(20_000);
    await runtime.pollDueSources();

    expect(events.filter((event) => event.type === 'weather:update')).toHaveLength(1);
    expect(source.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good snapshot visible and marks only the failing source unhealthy', async () => {
    const clock = makeClock();
    const windsup = {
      id: 'windsup_porticcio',
      pollMs: 20_000,
      fetch: vi
        .fn()
        .mockResolvedValueOnce(reading('windsup_porticcio', '2026-05-25T08:00:00.000Z', 10))
        .mockRejectedValueOnce(new Error('upstream blocked')),
    };
    const meteofrance = {
      id: 'meteofrance_20004003',
      pollMs: 20_000,
      fetch: vi.fn().mockResolvedValue(reading('meteofrance_20004003', '2026-05-25T08:00:20.000Z', 7)),
    };
    const runtime = createWeatherRuntime({ clock, sources: [windsup, meteofrance] });

    await runtime.pollDueSources();
    clock.advance(20_000);
    await runtime.pollDueSources();

    const snapshot = runtime.getSnapshot();
    expect(snapshot.windData.porticcio.live.windSpeed).toBe(10);
    expect(snapshot.windData.la_parata.live.windSpeed).toBe(7);
    expect(snapshot.sourceHealth.windsup_porticcio).toMatchObject({
      status: 'error',
      consecutiveFailures: 1,
    });
    expect(snapshot.sourceHealth.meteofrance_20004003).toMatchObject({
      status: 'ok',
      consecutiveFailures: 0,
    });
  });

  it('routes all dashboard source families into their UI buckets', async () => {
    const clock = makeClock();
    const sources = [
      {
        id: 'windsup_tonnara',
        pollMs: 20_000,
        fetch: vi.fn().mockResolvedValue(reading('windsup_tonnara', '2026-05-25T08:00:00.000Z', 11)),
      },
      {
        id: 'windsup_porto_polo',
        pollMs: 20_000,
        fetch: vi.fn().mockResolvedValue(reading('windsup_porto_polo', '2026-05-25T08:00:00.000Z', 9)),
      },
      {
        id: 'windsup_figari_eole',
        pollMs: 20_000,
        fetch: vi.fn().mockResolvedValue(reading('windsup_figari_eole', '2026-05-25T08:00:00.000Z', 13)),
      },
      {
        id: 'candhis_revellata',
        pollMs: 20_000,
        fetch: vi.fn().mockResolvedValue({
          source: 'candhis_revellata',
          observedAt: '2026-05-25T08:00:00.000Z',
          payload: {
            waterTemp: 19.4,
            waterHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), waterTemp: 19.4 }],
            surf: { height: 1.1, hmax: 1.7, period: 8, direction: 260, spread: 35 },
            surfHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), height: 1.1 }],
          },
        }),
      },
      {
        id: 'candhis_alistro',
        pollMs: 20_000,
        fetch: vi.fn().mockResolvedValue({
          source: 'candhis_alistro',
          observedAt: '2026-05-25T08:00:00.000Z',
          payload: {
            waterTemp: 22.1,
            waterHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), waterTemp: 22.1 }],
            surf: { height: 0.2, hmax: 0.3, period: 3.5, direction: 21, spread: 26 },
            surfHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), height: 0.2 }],
          },
        }),
      },
      {
        id: 'esurfmar_ajaccio',
        pollMs: 20_000,
        fetch: vi.fn().mockResolvedValue({
          source: 'esurfmar_ajaccio',
          observedAt: '2026-05-25T08:00:00.000Z',
          payload: {
            live: {
              windSpeed: 12,
              windGust: 18,
              windDirection: 270,
            },
            history: [],
            height: 1.2,
            hmax: 1.8,
            period: 8,
            direction: 270,
            surfHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), height: 1.2 }],
          },
        }),
      },
    ];
    const runtime = createWeatherRuntime({ clock, sources });

    await runtime.pollDueSources();

    const snapshot = runtime.getSnapshot();
    expect(snapshot.windData.la_tonnara.live.windSpeed).toBe(11);
    expect(snapshot.windData.porto_polo.live.windSpeed).toBe(9);
    expect(snapshot.windData.figari_eole.live.windSpeed).toBe(13);
    expect(snapshot.windData.ajaccio_buoy.live.windSpeed).toBe(12);
    expect(snapshot.surfData.ajaccio.height).toBe(1.2);
    expect(snapshot.surfData.revellata).toMatchObject({
      height: 1.1,
      waterTemp: 19.4,
    });
    expect(snapshot.surfData.alistro).toMatchObject({
      height: 0.2,
      waterTemp: 22.1,
    });
    expect(snapshot.waterData.current).toBe(19.4);
    expect(snapshot.windData.candhis_revellata).toBeUndefined();
    expect(snapshot.windData.candhis_alistro).toBeUndefined();
  });

  it('extends short upstream wind histories with the retained snapshot history', async () => {
    const clock = makeClock('2026-05-27T08:00:00.000Z');
    const initialSnapshot = {
      ts: '2026-05-27T07:59:40.000Z',
      windData: {
        porticcio: {
          live: {
            windSpeed: 10,
            windGust: 14,
            windDirection: 270,
          },
          history: [
            {
              time: '2026-05-25T08:00:00.000Z',
              avgSpeed: 8,
              maxGust: 12,
              windDirection: 260,
            },
            {
              time: '2026-05-27T06:00:00.000Z',
              avgSpeed: 10,
              maxGust: 14,
              windDirection: 270,
            },
          ],
        },
      },
      surfData: {},
      waterData: null,
      sourceHealth: {},
    };
    const source = {
      id: 'windsup_porticcio',
      pollMs: 20_000,
      fetch: vi.fn().mockResolvedValue({
        source: 'windsup_porticcio',
        observedAt: '2026-05-27T08:00:00.000Z',
        payload: {
          live: {
            windSpeed: 16,
            windGust: 20,
            windDirection: 250,
          },
          history: [
            {
              time: '2026-05-27T07:50:00.000Z',
              avgSpeed: 15,
              maxGust: 18,
              windDirection: 252,
            },
            {
              time: '2026-05-27T08:00:00.000Z',
              avgSpeed: 16,
              maxGust: 20,
              windDirection: 250,
            },
          ],
        },
      }),
    };
    const runtime = createWeatherRuntime({
      clock,
      sources: [source],
      initialSnapshot,
    });

    await runtime.pollDueSources();

    const history = runtime.getSnapshot().windData.porticcio.history;
    expect(history.map((point) => point.avgSpeed)).toEqual([8, 10, 15, 16]);
    expect(history.map((point) => point.windDirection)).toEqual([260, 270, 252, 250]);
  });

  it('bounds retained wind history to the runtime retention window', async () => {
    const clock = makeClock('2026-05-27T08:00:00.000Z');
    const runtime = createWeatherRuntime({
      clock,
      historyRetentionMs: 60 * 60 * 1000,
      initialSnapshot: {
        ts: '2026-05-27T07:59:40.000Z',
        windData: {
          porticcio: {
            live: {
              windSpeed: 9,
              windGust: 12,
              windDirection: 270,
            },
            history: [
              {
                time: '2026-05-27T06:30:00.000Z',
                avgSpeed: 7,
                maxGust: 11,
                windDirection: 260,
              },
              {
                time: '2026-05-27T07:30:00.000Z',
                avgSpeed: 9,
                maxGust: 12,
                windDirection: 270,
              },
            ],
          },
        },
        surfData: {},
        waterData: null,
        sourceHealth: {},
      },
      sources: [{
        id: 'windsup_porticcio',
        pollMs: 20_000,
        fetch: vi.fn().mockResolvedValue(reading('windsup_porticcio', '2026-05-27T08:00:00.000Z', 12)),
      }],
    });

    await runtime.pollDueSources();

    const history = runtime.getSnapshot().windData.porticcio.history;
    expect(history.map((point) => point.avgSpeed)).toEqual([9, 12]);
  });

  it('restores an initial snapshot and records persisted observations during polling', async () => {
    const clock = makeClock();
    const initialSnapshot = {
      ts: '2026-05-25T07:59:40.000Z',
      windData: {
        porticcio: {
          live: {
            windSpeed: 9,
            windGust: 13,
            windDirection: 260,
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
          lastSuccessAt: '2026-05-25T07:59:40.000Z',
          lastErrorAt: null,
          lastErrorMessage: null,
          nextPollAt: '2026-05-25T08:00:00.000Z',
        },
      },
    };
    const store = {
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      appendObservation: vi.fn().mockResolvedValue(undefined),
    };
    const source = {
      id: 'windsup_porticcio',
      pollMs: 20_000,
      fetch: vi.fn().mockResolvedValue(reading('windsup_porticcio', '2026-05-25T08:00:00.000Z', 12)),
    };

    const runtime = createWeatherRuntime({
      clock,
      sources: [source],
      initialSnapshot,
      store,
    });

    expect(runtime.getSnapshot().windData.porticcio.live.windSpeed).toBe(9);

    await runtime.pollDueSources();

    expect(store.appendObservation).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'windsup_porticcio',
      observedAt: '2026-05-25T08:00:00.000Z',
      receivedAt: '2026-05-25T08:00:00.000Z',
      changed: true,
    }));
    expect(store.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      ts: '2026-05-25T08:00:00.000Z',
      windData: expect.objectContaining({
        porticcio: expect.objectContaining({
          live: expect.objectContaining({
            windSpeed: 12,
          }),
        }),
      }),
    }));
  });
});
