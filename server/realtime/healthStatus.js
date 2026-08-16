const MINUTE_MS = 60_000;

export const SOURCE_UNAVAILABLE_AFTER_MS = 48 * 60 * MINUTE_MS;

const SOURCE_STALE_THRESHOLDS = [
  [/^meteofrance_/, 90 * MINUTE_MS],
  [/^(candhis_|esurfmar_)/, 3 * 60 * MINUTE_MS],
  [/^windsup_/, 3 * 60 * MINUTE_MS],
  [/^wunderground_ICORSEPR2$/, 30 * MINUTE_MS],
  [/^(wunderground_|pioupiou_)/, 15 * MINUTE_MS],
];

export function staleThresholdForSource(sourceId) {
  return SOURCE_STALE_THRESHOLDS.find(([pattern]) => pattern.test(sourceId))?.[1] ?? 60 * MINUTE_MS;
}

export function providerForSource(sourceId) {
  if (sourceId.startsWith('meteofrance_')) return 'meteofrance';
  if (sourceId.startsWith('wunderground_')) return 'wunderground';
  if (sourceId.startsWith('windsup_')) return 'windsup';
  if (sourceId.startsWith('candhis_')) return 'candhis';
  if (sourceId.startsWith('esurfmar_')) return 'esurfmar';
  if (sourceId.startsWith('pioupiou_')) return 'pioupiou';
  return 'other';
}

export function classifySourceHealth(sourceId, health = {}, now = Date.now()) {
  const lastAttempt = Date.parse(health.lastAttemptAt);
  const lastObserved = Date.parse(health.lastObservedAt);
  const staleAfterMs = staleThresholdForSource(sourceId);
  const observationAgeMs = Number.isFinite(lastObserved) ? Math.max(0, now - lastObserved) : null;
  let status = 'unknown';

  if (health.status === 'error') status = 'error';
  else if (health.status === 'stale') status = 'stale';
  else if (health.status === 'ok' && observationAgeMs === null) status = 'unavailable';
  else if (health.status === 'ok' && observationAgeMs > staleAfterMs) status = 'stale';
  else if (health.status === 'ok') status = 'healthy';

  return {
    sourceId,
    provider: providerForSource(sourceId),
    status,
    consecutiveFailures: health.consecutiveFailures ?? 0,
    lastAttemptAt: health.lastAttemptAt ?? null,
    attemptAgeMs: Number.isFinite(lastAttempt) ? Math.max(0, now - lastAttempt) : null,
    lastSuccessAt: health.lastSuccessAt ?? null,
    lastObservedAt: health.lastObservedAt ?? null,
    observationAgeMs,
    staleAfterMs,
    lastErrorAt: health.lastErrorAt ?? null,
    lastErrorMessage: health.lastErrorMessage ?? null,
    nextPollAt: health.nextPollAt ?? null,
  };
}

export function summarizeProviders(snapshot, now = Date.now()) {
  const sources = Object.entries(snapshot?.sourceHealth ?? {})
    .map(([sourceId, health]) => classifySourceHealth(sourceId, health, now));
  const counts = sources.reduce((result, source) => {
    result[source.status] = (result[source.status] ?? 0) + 1;
    return result;
  }, { healthy: 0, stale: 0, unavailable: 0, error: 0, unknown: 0 });
  const degraded = counts.error + counts.stale + counts.unavailable > 0;
  return {
    status: degraded ? 'degraded' : 'healthy',
    checkedAt: snapshot?.checkedAt ?? null,
    counts,
    sources,
  };
}

export function assessReadiness(snapshot, { now = Date.now(), maxAgeMs = 5 * MINUTE_MS } = {}) {
  const checkedAt = Date.parse(snapshot?.checkedAt);
  const checkAgeMs = Number.isFinite(checkedAt) ? Math.max(0, now - checkedAt) : null;
  const hasWeatherData = Object.values(snapshot?.windData ?? {}).some((value) => value?.live)
    || Object.values(snapshot?.surfData ?? {}).some(Boolean)
    || Boolean(snapshot?.waterData);
  const reasons = [];
  if (!hasWeatherData) reasons.push('weather_data_unavailable');
  if (checkAgeMs === null) reasons.push('scheduler_not_checked_yet');
  else if (checkAgeMs > maxAgeMs) reasons.push('scheduler_check_stale');
  return {
    status: reasons.length === 0 ? 'ready' : 'not_ready',
    ready: reasons.length === 0,
    checkedAt: snapshot?.checkedAt ?? null,
    checkAgeMs,
    maxAgeMs,
    hasWeatherData,
    reasons,
  };
}
