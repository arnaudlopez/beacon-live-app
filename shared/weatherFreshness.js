// A retained measurement can remain useful for consultation, but not for alerts.
export const ALERT_MAX_AGE_MS = 30 * 60 * 1000;
export const OBSERVATION_RETENTION_MS = 48 * 60 * 60 * 1000;

export function observationTime(data) {
  const values = data?.observedAt != null
    ? [data.observedAt]
    : (data?.history || data?.surfHistory || []).map(point => point?.time);
  const times = values.filter(value => value != null).map(value => new Date(value).getTime()).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

export function isAlertObservationFresh(data, now = Date.now()) {
  const time = observationTime(data);
  return Boolean(data?.live && time !== null && now - time >= -60_000 && now - time <= ALERT_MAX_AGE_MS
    && (!data.sourceStatus || data.sourceStatus === 'ok'));
}
