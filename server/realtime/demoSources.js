const DEFAULT_POLL_MS = 20_000;

function round(value) {
  return Math.round(value * 10) / 10;
}

function buildReading({ clock, sourceId, baseSpeed, direction }) {
  const now = clock.now();
  const minute = Math.floor(now / 60_000);
  const speed = round(baseSpeed + (minute % 7) * 0.8);
  const gust = round(speed + 4 + (minute % 3) * 0.5);
  const observedAt = new Date(now).toISOString();

  return {
    source: sourceId,
    observedAt,
    payload: {
      live: {
        windSpeed: speed,
        windGust: gust,
        windDirection: direction,
      },
      history: Array.from({ length: 6 }, (_, index) => {
        const time = new Date(now - (5 - index) * 10 * 60_000).toISOString();
        const historySpeed = round(baseSpeed + ((minute - (5 - index) * 10) % 7) * 0.8);
        return {
          time,
          avgSpeed: historySpeed,
          maxGust: round(historySpeed + 4),
          windDirection: direction,
        };
      }),
    },
  };
}

export function createDemoWeatherSources({ clock, pollMs = DEFAULT_POLL_MS } = {}) {
  if (!clock || typeof clock.now !== 'function') {
    throw new Error('createDemoWeatherSources requires a clock with now()');
  }

  const definitions = [
    {
      id: 'windsup_porticcio',
      baseSpeed: 10,
      direction: 270,
    },
    {
      id: 'meteofrance_20004003',
      baseSpeed: 7,
      direction: 245,
    },
  ];

  return definitions.map((definition) => ({
    id: definition.id,
    pollMs,
    fetch: () => Promise.resolve(buildReading({
      clock,
      sourceId: definition.id,
      baseSpeed: definition.baseSpeed,
      direction: definition.direction,
    })),
  }));
}
