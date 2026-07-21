export const SOURCE_UNAVAILABLE_AFTER_MS = 48 * 60 * 60 * 1000;

export function latestObservationTime(sourceData) {
  const candidates = [sourceData?.observedAt, ...(sourceData?.history ?? []).map((point) => point?.time)]
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

export function isSourceAvailable(_source, sourceData, now = Date.now()) {
  if (!sourceData?.live) return false;

  const observedAt = latestObservationTime(sourceData);
  if (observedAt === null) return false;

  return now - observedAt < SOURCE_UNAVAILABLE_AFTER_MS;
}
