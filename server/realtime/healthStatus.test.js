import { describe, expect, it } from 'vitest';
import { assessReadiness, classifySourceHealth, summarizeProviders } from './healthStatus.js';

const NOW = Date.parse('2026-07-11T13:00:00.000Z');

describe('backend health classification', () => {
  it('uses provider-specific freshness thresholds', () => {
    const fast = classifySourceHealth('wunderground_IGROSS105', {
      status: 'ok',
      lastObservedAt: '2026-07-11T12:30:00.000Z',
    }, NOW);
    const hourly = classifySourceHealth('meteofrance_20004002', {
      status: 'ok',
      lastObservedAt: '2026-07-11T12:30:00.000Z',
    }, NOW);

    expect(fast.status).toBe('stale');
    expect(hourly.status).toBe('healthy');
  });

  it('distinguishes provider errors from successful responses without observations', () => {
    expect(classifySourceHealth('candhis_revellata', { status: 'ok', lastObservedAt: null }, NOW).status)
      .toBe('unavailable');
    expect(classifySourceHealth('windsup_porticcio', {
      status: 'error',
      consecutiveFailures: 3,
      lastErrorMessage: 'upstream_timeout_15000ms',
    }, NOW).status).toBe('error');
  });

  it('reports degraded provider counts without failing core readiness', () => {
    const snapshot = {
      checkedAt: '2026-07-11T12:59:30.000Z',
      windData: { lfkj: { live: { windSpeed: 10 } } },
      surfData: {},
      waterData: null,
      sourceHealth: {
        meteofrance_20004002: { status: 'ok', lastObservedAt: '2026-07-11T12:54:00.000Z' },
        esurfmar_calvi: { status: 'ok', lastObservedAt: '2026-06-30T23:00:00.000Z' },
      },
    };

    expect(assessReadiness(snapshot, { now: NOW })).toMatchObject({ ready: true, status: 'ready' });
    expect(summarizeProviders(snapshot, NOW)).toMatchObject({
      status: 'degraded',
      counts: { healthy: 1, stale: 1 },
    });
  });

  it('fails readiness when the scheduler has not completed recently', () => {
    const readiness = assessReadiness({
      checkedAt: '2026-07-11T12:50:00.000Z',
      windData: { lfkj: { live: { windSpeed: 10 } } },
    }, { now: NOW, maxAgeMs: 300_000 });

    expect(readiness).toMatchObject({
      ready: false,
      reasons: ['scheduler_check_stale'],
    });
  });
});
