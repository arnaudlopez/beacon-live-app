const WIND_SOURCE_MAP = {
  meteofrance_20004002: 'lfkj',
  meteofrance_20004003: 'la_parata',
  windsup_porticcio: 'porticcio',
  wunderground_IGROSS105: 'porticcio_haut',
  wunderground_ISARROLA7: 'mezzavia',
  wunderground_ICORSEPR2: 'propriano',
  wunderground_ISARTN1: 'tizzano',
  wunderground_IBONIF6: 'bonifacio_tramizzi',
  esurfmar_ajaccio: 'ajaccio_buoy',
  esurfmar_calvi: 'calvi_buoy',
  pioupiou_1202: 'owm-1202',
};

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

export function createWeatherRuntime({ clock, sources, initialSnapshot, store }) {
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
    const appSourceId = WIND_SOURCE_MAP[source.id] || source.id;
    const initialPayload = snapshot.windData[appSourceId];
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

  function mergeReading(sourceId, sourceState, reading) {
    const appSourceId = WIND_SOURCE_MAP[sourceId] || sourceId;
    const payload = reading?.payload ?? reading;
    const hash = stableStringify(payload);
    const changed = hash !== sourceState.hash;

    if (changed) {
      snapshot.windData[appSourceId] = clone(payload);
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
