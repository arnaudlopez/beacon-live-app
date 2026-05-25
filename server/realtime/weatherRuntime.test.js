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
    expect(snapshot.windData.ajaccio_buoy.live.windSpeed).toBe(12);
    expect(snapshot.surfData.ajaccio.height).toBe(1.2);
    expect(snapshot.surfData.revellata).toMatchObject({
      height: 1.1,
      waterTemp: 19.4,
    });
    expect(snapshot.waterData.current).toBe(19.4);
    expect(snapshot.windData.candhis_revellata).toBeUndefined();
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
