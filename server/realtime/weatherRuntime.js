const WIND_SOURCE_MAP = {
  meteofrance_20004002: 'lfkj',
  meteofrance_20004003: 'la_parata',
  windsup_porticcio: 'porticcio',
  windsup_tonnara: 'la_tonnara',
  windsup_porto_polo: 'porto_polo',
  windsup_piantarella: 'piantarella',
  windsup_santa_manza: 'santa_manza',
  windsup_balistra: 'balistra',
  windsup_figari_eole: 'figari_eole',
  wunderground_IGROSS105: 'porticcio_haut',
  wunderground_ISARROLA7: 'mezzavia',
  wunderground_ICORSEPR2: 'propriano',
  wunderground_ISARTN1: 'tizzano',
  wunderground_IBONIF6: 'bonifacio_tramizzi',
  esurfmar_ajaccio: 'ajaccio_buoy',
  esurfmar_calvi: 'calvi_buoy',
  pioupiou_1202: 'owm-1202',
};

const CANDHIS_SOURCE_MAP = {
  candhis_revellata: 'revellata',
  candhis_bonifacio: 'bonifacio',
  candhis_alistro: 'alistro',
};

const ESURFMAR_SOURCE_MAP = {
  esurfmar_ajaccio: 'ajaccio',
};

const DEFAULT_HISTORY_RETENTION_MS = 48 * 60 * 60 * 1000;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function toTimestamp(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function normalizeHistoryPoint(point) {
  const time = toTimestamp(point?.time);
  if (time === null) return null;

  return {
    time,
    avgSpeed: point.avgSpeed ?? null,
    maxGust: point.maxGust ?? null,
    temperature: point.temperature ?? null,
    windDirection: point.windDirection ?? null,
    ...(point.waterTemp !== undefined ? { waterTemp: point.waterTemp } : {}),
  };
}

function historyPointFromLive(payload, observedAt) {
  if (!payload?.live) return null;
  const time = toTimestamp(observedAt);
  if (time === null) return null;

  return {
    time,
    avgSpeed: payload.live.windSpeed ?? null,
    maxGust: payload.live.windGust ?? payload.live.windSpeed ?? null,
    temperature: payload.live.temperature ?? null,
    windDirection: payload.live.windDirection ?? null,
  };
}

function mergeHistoryPoints({ previousHistory, nextHistory, livePoint, now, retentionMs }) {
  const cutoff = now - retentionMs;
  const byTime = new Map();

  for (const point of [...(previousHistory ?? []), ...(nextHistory ?? []), livePoint].filter(Boolean)) {
    const normalized = normalizeHistoryPoint(point);
    if (!normalized || normalized.time < cutoff) continue;
    byTime.set(normalized.time, normalized);
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

function mergeWindPayloadHistory({ previousPayload, nextPayload, observedAt, now, retentionMs }) {
  const payload = clone(nextPayload);
  if (!payload || typeof payload !== 'object') return payload;

  payload.history = mergeHistoryPoints({
    previousHistory: previousPayload?.history,
    nextHistory: payload.history,
    livePoint: historyPointFromLive(payload, observedAt),
    now,
    retentionMs,
  });

  return payload;
}

function createInitialSourceState() {
  return {
    hash: null,
    nextPollAt: 0,
    consecutiveFailures: 0,
  };
}

function createSnapshot(clock, initialSnapshot) {
  return {
    ts: initialSnapshot?.ts ?? new Date(clock.now()).toISOString(),
    windData: clone(initialSnapshot?.windData) ?? {},
    surfData: clone(initialSnapshot?.surfData) ?? {},
    waterData: clone(initialSnapshot?.waterData) ?? null,
    sourceHealth: clone(initialSnapshot?.sourceHealth) ?? {},
  };
}

export function createWeatherRuntime({
  clock,
  sources,
  initialSnapshot,
  store,
  historyRetentionMs = DEFAULT_HISTORY_RETENTION_MS,
}) {
  if (!clock || typeof clock.now !== 'function') {
    throw new Error('createWeatherRuntime requires a clock with now()');
  }
  if (!Array.isArray(sources)) {
    throw new Error('createWeatherRuntime requires sources');
  }

  const sourceStates = new Map();
  const subscribers = new Set();
  const snapshot = createSnapshot(clock, initialSnapshot);

  for (const source of sources) {
    const sourceState = createInitialSourceState();
    const initialPayload = getPayloadForSource(source.id);
    if (initialPayload !== undefined) {
      sourceState.hash = stableStringify(initialPayload);
    }

    const initialHealth = snapshot.sourceHealth[source.id];
    const nextPollAt = toTimestamp(initialHealth?.nextPollAt);
    if (nextPollAt !== null) {
      sourceState.nextPollAt = nextPollAt;
    }

    sourceStates.set(source.id, sourceState);
    snapshot.sourceHealth[source.id] = {
      status: 'unknown',
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      nextPollAt: new Date(0).toISOString(),
      ...initialHealth,
    };
  }

  function notify(event) {
    for (const subscriber of subscribers) {
      subscriber(clone(event));
    }
  }

  function updateHealth(sourceId, patch) {
    snapshot.sourceHealth[sourceId] = {
      ...snapshot.sourceHealth[sourceId],
      ...patch,
    };
  }

  async function persistSnapshot() {
    if (typeof store?.saveSnapshot === 'function') {
      await store.saveSnapshot(getSnapshot());
    }
  }

  async function persistObservation(observation) {
    if (typeof store?.appendObservation === 'function') {
      await store.appendObservation(clone(observation));
    }
  }

  function getPayloadForSource(sourceId) {
    const windSourceId = WIND_SOURCE_MAP[sourceId];
    if (windSourceId) return snapshot.windData[windSourceId];

    const candhisSpotId = CANDHIS_SOURCE_MAP[sourceId];
    if (candhisSpotId) {
      return snapshot.surfData[candhisSpotId] ?? snapshot.windData[sourceId];
    }

    const esurfmarSpotId = ESURFMAR_SOURCE_MAP[sourceId];
    if (esurfmarSpotId) {
      return snapshot.surfData[esurfmarSpotId] ?? snapshot.windData[WIND_SOURCE_MAP[sourceId]];
    }

    return snapshot.windData[sourceId];
  }

  function mergeCandhisPayload(sourceId, payload) {
    const spotId = CANDHIS_SOURCE_MAP[sourceId];
    if (!spotId) return false;

    snapshot.surfData[spotId] = payload?.surf
      ? {
          ...clone(payload.surf),
          waterTemp: payload.waterTemp ?? null,
          surfHistory: clone(payload.surfHistory) ?? [],
        }
      : null;

    if (sourceId === 'candhis_revellata') {
      snapshot.waterData = {
        current: payload?.waterTemp ?? null,
        history: clone(payload?.waterHistory) ?? [],
      };
    }

    delete snapshot.windData[sourceId];
    return true;
  }

  function mergeESurfmarPayload(sourceId, payload, observedAt) {
    const windSourceId = WIND_SOURCE_MAP[sourceId];
    const surfSpotId = ESURFMAR_SOURCE_MAP[sourceId];

    if (windSourceId && payload?.live) {
      snapshot.windData[windSourceId] = mergeWindPayloadHistory({
        previousPayload: snapshot.windData[windSourceId],
        nextPayload: payload,
        observedAt,
        now: clock.now(),
        retentionMs: historyRetentionMs,
      });
    }

    if (surfSpotId) {
      snapshot.surfData[surfSpotId] = clone(payload);
    }

    return Boolean(windSourceId || surfSpotId);
  }

  function mergePayload(sourceId, payload, observedAt) {
    if (CANDHIS_SOURCE_MAP[sourceId]) return mergeCandhisPayload(sourceId, payload);
    if (sourceId.startsWith('esurfmar_')) return mergeESurfmarPayload(sourceId, payload, observedAt);

    const appSourceId = WIND_SOURCE_MAP[sourceId] || sourceId;
    snapshot.windData[appSourceId] = mergeWindPayloadHistory({
      previousPayload: snapshot.windData[appSourceId],
      nextPayload: payload,
      observedAt,
      now: clock.now(),
      retentionMs: historyRetentionMs,
    });
    return true;
  }

  function mergeReading(sourceId, sourceState, reading) {
    const payload = reading?.payload ?? reading;
    const hash = stableStringify(payload);
    const changed = hash !== sourceState.hash;

    if (changed) {
      mergePayload(sourceId, payload, reading?.observedAt);
      sourceState.hash = hash;
    }

    return {
      changed,
      observedAt: reading?.observedAt,
    };
  }

  async function pollSource(source) {
    const sourceState = sourceStates.get(source.id);
    const now = clock.now();
    sourceState.nextPollAt = now + source.pollMs;

    try {
      const reading = await source.fetch();
      const result = mergeReading(source.id, sourceState, reading);
      sourceState.consecutiveFailures = 0;
      const receivedAt = new Date(now).toISOString();
      updateHealth(source.id, {
        status: 'ok',
        consecutiveFailures: 0,
        lastSuccessAt: receivedAt,
        lastErrorMessage: null,
        nextPollAt: new Date(sourceState.nextPollAt).toISOString(),
      });
      await persistObservation({
        sourceId: source.id,
        observedAt: result.observedAt,
        receivedAt,
        changed: result.changed,
        payload: reading?.payload ?? reading,
      });
      return result.changed
        ? {
            sourceId: source.id,
            observedAt: result.observedAt,
          }
        : null;
    } catch (error) {
      sourceState.consecutiveFailures += 1;
      updateHealth(source.id, {
        status: 'error',
        consecutiveFailures: sourceState.consecutiveFailures,
        lastErrorAt: new Date(now).toISOString(),
        lastErrorMessage: error instanceof Error ? error.message : String(error),
        nextPollAt: new Date(sourceState.nextPollAt).toISOString(),
      });
      return null;
    }
  }

  async function pollDueSources() {
    const now = clock.now();
    const dueSources = sources.filter((source) => {
      const state = sourceStates.get(source.id);
      return state && now >= state.nextPollAt;
    });

    if (dueSources.length === 0) return [];

    const changed = [];
    for (const source of dueSources) {
      const result = await pollSource(source);
      if (result) changed.push(result);
    }

    if (changed.length > 0) {
      snapshot.ts = new Date(clock.now()).toISOString();
      const observedTimes = changed
        .map((item) => toTimestamp(item.observedAt))
        .filter((time) => time !== null);
      const newestObservedAt = observedTimes.length > 0 ? Math.max(...observedTimes) : clock.now();
      const event = {
        type: 'weather:update',
        sources: changed.map((item) => item.sourceId),
        data: getSnapshot(),
        latencyMs: Math.max(0, clock.now() - newestObservedAt),
      };
      await persistSnapshot();
      notify(event);
      return [event];
    }

    await persistSnapshot();
    return [];
  }

  function getSnapshot() {
    return clone(snapshot);
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return {
    getSnapshot,
    pollDueSources,
    subscribe,
  };
}
