import { observationTime } from '../../shared/weatherFreshness';
export const SOURCE_UNAVAILABLE_AFTER_MS = 48 * 60 * 60 * 1000;

export const latestObservationTime = observationTime;

export function isSourceAvailable(_source, sourceData, now = Date.now()) {
  if (!sourceData?.live) return false;

  const observedAt = latestObservationTime(sourceData);
  if (observedAt === null) return false;

  return now - observedAt < SOURCE_UNAVAILABLE_AFTER_MS;
}
