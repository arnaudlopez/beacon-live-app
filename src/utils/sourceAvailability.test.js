import { describe, expect, it } from 'vitest';
import { isSourceAvailable, latestObservationTime } from './sourceAvailability';

const NOW = Date.parse('2026-07-21T09:00:00.000Z');
const parata = { id: 'la_parata', type: 'meteofrance' };

describe('source availability', () => {
  it('rejects a stale live payload even when values are still present', () => {
    expect(isSourceAvailable(parata, {
      live: { windSpeed: '7.2', windGust: '9.1' },
      observedAt: '2026-07-18T04:00:00.000Z',
      history: [],
    }, NOW)).toBe(false);
  });

  it('keeps delayed observations available until the 48-hour limit', () => {
    expect(isSourceAvailable(parata, {
      live: { windSpeed: '7.2', windGust: '9.1' },
      observedAt: '2026-07-21T07:00:00.000Z',
      history: [],
    }, NOW)).toBe(true);
  });

  it('becomes unavailable at exactly 48 hours without a measurement', () => {
    expect(isSourceAvailable(parata, {
      live: { windSpeed: '7.2', windGust: '9.1' },
      observedAt: '2026-07-19T09:00:00.000Z',
      history: [],
    }, NOW)).toBe(false);
  });

  it('rejects undated live values instead of presenting them as current', () => {
    expect(isSourceAvailable(parata, {
      live: { windSpeed: '7.2', windGust: '9.1' },
      history: [],
    }, NOW)).toBe(false);
  });

  it('accepts a recent observation and uses the newest available timestamp', () => {
    const data = {
      live: { windSpeed: '8.0', windGust: '10.0' },
      observedAt: '2026-07-21T08:54:00.000Z',
      history: [{ time: '2026-07-21T08:48:00.000Z' }],
    };

    expect(latestObservationTime(data)).toBe(Date.parse('2026-07-21T08:54:00.000Z'));
    expect(isSourceAvailable(parata, data, NOW)).toBe(true);
  });
});
