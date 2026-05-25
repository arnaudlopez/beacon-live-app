import { describe, expect, it } from 'vitest';
import { createDemoWeatherSources } from './demoSources.js';

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

describe('demo weather sources contract', () => {
  it('provides no-secret source adapters using existing Beacon source ids', async () => {
    const clock = makeClock();
    const sources = createDemoWeatherSources({ clock });

    expect(sources.map((source) => source.id)).toEqual(expect.arrayContaining([
      'windsup_porticcio',
      'meteofrance_20004003',
    ]));

    const porticcio = sources.find((source) => source.id === 'windsup_porticcio');
    const first = await porticcio.fetch();

    expect(first).toMatchObject({
      source: 'windsup_porticcio',
      observedAt: '2026-05-25T08:00:00.000Z',
      payload: {
        live: {
          windDirection: expect.any(Number),
          windGust: expect.any(Number),
          windSpeed: expect.any(Number),
        },
        history: expect.any(Array),
      },
    });

    clock.advance(60_000);
    const second = await porticcio.fetch();

    expect(second.observedAt).toBe('2026-05-25T08:01:00.000Z');
    expect(second.payload.live.windSpeed).not.toBe(first.payload.live.windSpeed);
  });
});
