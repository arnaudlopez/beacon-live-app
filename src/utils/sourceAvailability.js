const MINUTE_MS = 60_000;

function staleAfterMs(source) {
  if (source?.type === 'meteofrance') return 90 * MINUTE_MS;
  if (source?.type === 'esurfmar') return 3 * 60 * MINUTE_MS;
  if (source?.type === 'wunderground' && source.id === 'propriano') return 30 * MINUTE_MS;
  if (['wunderground', 'windsup', 'owm'].includes(source?.type)) return 15 * MINUTE_MS;
  return 60 * MINUTE_MS;
}

export function latestObservationTime(sourceData) {
  const candidates = [sourceData?.observedAt, ...(sourceData?.history ?? []).map((point) => point?.time)]
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

export function isSourceAvailable(source, sourceData, now = Date.now()) {
  if (!sourceData?.live) return false;

  const observedAt = latestObservationTime(sourceData);
  if (observedAt === null) return false;

  return now - observedAt <= staleAfterMs(source);
}
