const DEFAULT_FAST_POLL_MS = 30_000;
const DEFAULT_SLOW_POLL_MS = 15 * 60_000;
const WUNDERGROUND_API_KEY = 'e1f10a1e78da46f5b10a1e78da96f525';

const FR_MONTHS = {
  janvier: 0,
  fevrier: 1,
  'février': 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  'août': 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  'décembre': 11,
};

function toKtsFromMs(value) {
  return (Number(value) * 1.94384).toFixed(1);
}

function toKtsFromKmh(value) {
  return Number((Number(value) / 1.852).toFixed(1));
}

function observedAtFromPayload(payload, fallback) {
  const history = payload?.history || payload?.surfHistory || payload?.waterHistory || [];
  const last = history.at?.(-1);
  if (last?.time) return new Date(last.time).toISOString();
  return new Date(fallback).toISOString();
}

async function readJson(response) {
  if (!response.ok) throw new Error(`upstream_http_${response.status}`);
  return response.json();
}

async function readText(response) {
  if (!response.ok) throw new Error(`upstream_http_${response.status}`);
  return response.text();
}

export function parseMeteoFranceObservations(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[0];

  return {
    live: {
      windSpeed: latest.ff ? toKtsFromMs(latest.ff) : '0',
      windGust: latest.fxi10
        ? toKtsFromMs(latest.fxi10)
        : latest.fxi
          ? toKtsFromMs(latest.fxi)
          : latest.ff
            ? toKtsFromMs(latest.ff)
            : '0',
      windDirection: latest.dd || 0,
      temperature: latest.t ? (Number(latest.t) - 273.15).toFixed(1) : null,
      humidity: latest.u || null,
      pressure: latest.pmer ? (Number(latest.pmer) / 100).toFixed(1) : null,
    },
    history: rows.map((item) => {
      const speed = item.ff ? Number(item.ff) * 1.94384 : 0;
      const gust = Number(item.fxi10 || item.fxi || item.ff || 0);
      return {
        time: item.validity_time || item.reference_time,
        avgSpeed: Number(speed.toFixed(1)),
        maxGust: Number((gust * 1.94384).toFixed(1)),
        temperature: item.t ? Number((Number(item.t) - 273.15).toFixed(1)) : null,
        windDirection: item.dd ?? null,
      };
    }).reverse(),
  };
}

export function parsePioupiouPayload(liveJson, archiveJson = { data: [] }) {
  const measurements = liveJson?.data?.measurements;
  if (!measurements) return null;

  const history = (archiveJson?.data || []).map((item) => ({
    time: item[0],
    avgSpeed: item[4] !== null ? Number((Number(item[4]) / 1.852).toFixed(1)) : 0,
    maxGust: item[5] !== null ? Number((Number(item[5]) / 1.852).toFixed(1)) : 0,
    windDirection: item[6] !== null ? Number(item[6]) : null,
  }));

  return {
    live: {
      windSpeed: (Number(measurements.wind_speed_avg) / 1.852).toFixed(1),
      windGust: (Number(measurements.wind_speed_max) / 1.852).toFixed(1),
      windDirection: measurements.wind_heading,
      temperature: null,
      humidity: null,
      pressure: null,
    },
    history,
  };
}

export function parseCandhisHtml(html) {
  let waterTemp = null;
  let waterHistory = [];
  let surf = null;
  let surfHistory = [];

  const waterMatch = html.match(/arrDataPHP\[4\]\s*=\s*eval\('(\[.*?\])'\);/);
  if (waterMatch?.[1]) {
    const rows = JSON.parse(waterMatch[1]);
    if (rows.length > 0) {
      waterTemp = rows[0][1];
      waterHistory = rows.map((item) => ({
        time: new Date(item[0].replace(' ', 'T')).getTime(),
        waterTemp: item[1],
      }));
    }
  }

  const heightMatch = html.match(/arrDataPHP\[0\]\s*=\s*eval\('(\[.*?\])'\);/);
  const periodMatch = html.match(/arrDataPHP\[1\]\s*=\s*eval\('(\[.*?\])'\);/);
  const directionMatch = html.match(/arrDataPHP\[2\]\s*=\s*eval\('(\[.*?\])'\);/);
  const spreadMatch = html.match(/arrDataPHP\[3\]\s*=\s*eval\('(\[.*?\])'\);/);

  if (heightMatch && periodMatch && directionMatch) {
    const heights = JSON.parse(heightMatch[1]);
    const periods = JSON.parse(periodMatch[1]);
    const directions = JSON.parse(directionMatch[1]);
    const spreads = spreadMatch ? JSON.parse(spreadMatch[1]) : [];
    if (heights.length > 0 && periods.length > 0 && directions.length > 0) {
      surf = {
        height: heights[0][1],
        hmax: heights[0][3],
        period: periods[0][1],
        direction: directions[0][1],
        spread: spreads.length > 0 ? spreads[0][1] : null,
      };

      const byTime = new Map();
      for (const row of heights) {
        const time = new Date(row[0].replace(' ', 'T')).getTime();
        byTime.set(String(time), {
          time,
          height: row[1],
          hmax: row[3] ?? null,
          period: null,
          direction: null,
          spread: null,
        });
      }
      for (const row of periods) {
        const time = new Date(row[0].replace(' ', 'T')).getTime();
        const entry = byTime.get(String(time));
        if (entry) entry.period = row[1];
      }
      for (const row of directions) {
        const time = new Date(row[0].replace(' ', 'T')).getTime();
        const entry = byTime.get(String(time));
        if (entry) entry.direction = row[1];
      }
      for (const row of spreads) {
        const time = new Date(row[0].replace(' ', 'T')).getTime();
        const entry = byTime.get(String(time));
        if (entry) entry.spread = row[1];
      }
      surfHistory = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
    }
  }

  return {
    waterTemp,
    waterHistory,
    surf,
    surfHistory,
  };
}

function parseESurfmarDate(dateStr, year = new Date().getUTCFullYear()) {
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{2})TU/);
  if (!match) return null;
  const month = FR_MONTHS[match[2].toLowerCase()];
  if (month === undefined) return null;
  return Date.UTC(year, month, Number(match[1]), Number(match[3]), 0, 0);
}

export function parseESurfmarHtml(html) {
  const rowRegex = /<tr bgcolor=#[F0-9A-Fa-f]{6}>\s*([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>(.*?)<\/td>/gs;
  const surfHistory = [];
  const history = [];
  let latestWaveRow = null;
  let latestWindRow = null;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells = [];
    let cellMatch;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, '').trim());
    }
    if (cells.length < 11) continue;

    const time = parseESurfmarDate(cells[0]);
    if (!time) continue;
    const hasWave = !Number.isNaN(Number.parseFloat(cells[9])) || !Number.isNaN(Number.parseFloat(cells[8]));
    const hasWind = !Number.isNaN(Number.parseFloat(cells[2])) || !Number.isNaN(Number.parseFloat(cells[3]));

    if (!latestWaveRow && hasWave) latestWaveRow = cells;
    if (!latestWindRow && hasWind) latestWindRow = cells;

    if (hasWave) {
      surfHistory.push({
        time,
        height: cells[9] ? Number.parseFloat(cells[9]) : null,
        hmax: cells[10] ? Number.parseFloat(cells[10]) : null,
        period: cells[8] ? Number.parseFloat(cells[8]) : null,
        direction: cells[1] ? Number.parseInt(cells[1], 10) : 270,
      });
    }
    if (hasWind) {
      history.push({
        time,
        avgSpeed: cells[2] ? Number.parseFloat(cells[2]) : 0,
        maxGust: cells[3] ? Number.parseFloat(cells[3]) : 0,
        temperature: cells[4] ? Number.parseFloat(cells[4]) : null,
        windDirection: cells[1] ? Number.parseInt(cells[1], 10) : null,
      });
    }
  }

  const result = {
    surfHistory: surfHistory.sort((a, b) => a.time - b.time),
    history: history.sort((a, b) => a.time - b.time),
  };

  if (latestWaveRow) {
    result.surf = {
      period: latestWaveRow[8] ? Number.parseFloat(latestWaveRow[8]) : null,
      height: latestWaveRow[9] ? Number.parseFloat(latestWaveRow[9]) : null,
      hmax: latestWaveRow[10] ? Number.parseFloat(latestWaveRow[10]) : null,
      direction: null,
    };
    result.period = result.surf.period;
    result.height = result.surf.height;
    result.hmax = result.surf.hmax;
    result.waterTemp = latestWaveRow[5] ? Number.parseFloat(latestWaveRow[5]) : null;
    result.direction = null;
  }

  if (latestWindRow) {
    result.live = {
      windSpeed: latestWindRow[2] ? Number.parseFloat(latestWindRow[2]) : 0,
      windGust: latestWindRow[3] ? Number.parseFloat(latestWindRow[3]) : 0,
      windDirection: latestWindRow[1] ? Number.parseInt(latestWindRow[1], 10) : null,
      temperature: latestWindRow[4] ? Number.parseFloat(latestWindRow[4]) : null,
      humidity: latestWindRow[6] ? Number.parseFloat(latestWindRow[6]) : null,
      pressure: latestWindRow[7] ? Number.parseFloat(latestWindRow[7]) : null,
    };
  }

  return result;
}

export function parseWindsUpMobileHtml(html) {
  const avgRegex = /\{x:(\d{13}),y:(\d+),o:"([^"]*)",color:"[^"]*",img:"[^"]*",?\}/g;
  const gustRegex = /\{x:(\d{13}),low:(\d+),high:(\d+),?\}/g;
  const degreeMatch = html.match(/class="deg"[^>]*>(\d{1,3})</);
  const preciseDirection = degreeMatch ? Number.parseInt(degreeMatch[1], 10) : null;
  const cardinalMap = {
    N: 0,
    NNE: 22,
    NE: 45,
    ENE: 67,
    E: 90,
    ESE: 112,
    SE: 135,
    SSE: 157,
    S: 180,
    SSO: 202,
    SO: 225,
    OSO: 247,
    O: 270,
    ONO: 292,
    NO: 315,
    NNO: 337,
  };

  const avgByTime = new Map();
  const gustByTime = new Map();
  let match;
  while ((match = avgRegex.exec(html)) !== null) {
    avgByTime.set(Number(match[1]), {
      avgSpeed: Number(match[2]),
      windDirection: preciseDirection ?? cardinalMap[match[3]] ?? null,
    });
  }
  while ((match = gustRegex.exec(html)) !== null) {
    gustByTime.set(Number(match[1]), Number(match[3]));
  }

  const history = Array.from(avgByTime.entries())
    .map(([time, value]) => ({
      time,
      avgSpeed: value.avgSpeed,
      maxGust: gustByTime.get(time) ?? value.avgSpeed,
      temperature: null,
      windDirection: value.windDirection,
    }))
    .sort((a, b) => a.time - b.time);

  if (history.length === 0) return null;
  const live = history.at(-1);
  return {
    live: {
      windSpeed: live.avgSpeed,
      windGust: live.maxGust,
      windDirection: live.windDirection,
      temperature: null,
      humidity: null,
      pressure: null,
    },
    history,
  };
}

export function parseWundergroundPayload(liveJson, historyJson = { observations: [] }) {
  const observation = liveJson?.observations?.[0];
  if (!observation) return null;
  const metric = observation.metric || observation.imperial || {};
  const live = {
    windSpeed: toKtsFromKmh(metric.windSpeed || 0),
    windGust: toKtsFromKmh(metric.windGust || 0),
    windDirection: observation.winddir || 0,
    temperature: metric.temp !== undefined ? Number(metric.temp.toFixed(1)) : null,
    humidity: observation.humidity || null,
    pressure: metric.pressure || null,
  };
  const history = (historyJson?.observations || []).map((item) => {
    const itemMetric = item.metric || item.imperial || {};
    return {
      time: new Date(item.obsTimeUtc).toISOString(),
      avgSpeed: toKtsFromKmh(itemMetric.windspeedAvg || 0),
      maxGust: toKtsFromKmh(itemMetric.windgustHigh || 0),
      temperature: itemMetric.tempAvg !== undefined ? Number(itemMetric.tempAvg.toFixed(1)) : null,
      windDirection: item.winddirAvg ?? null,
    };
  });
  const liveTime = new Date(observation.obsTimeUtc).toISOString();
  if (history.length === 0 || new Date(history.at(-1).time).getTime() < new Date(liveTime).getTime()) {
    history.push({
      time: liveTime,
      avgSpeed: live.windSpeed,
      maxGust: live.windGust,
      temperature: live.temperature,
      windDirection: live.windDirection,
    });
  }
  return {
    live,
    history,
  };
}

function sourceReading(sourceId, clock, payload) {
  return {
    source: sourceId,
    observedAt: observedAtFromPayload(payload, clock.now()),
    payload,
  };
}

async function fetchMeteoFrance({ stationId, sourceId, key, fetchImpl, clock }) {
  const url = `https://public-api.meteofrance.fr/public/DPPaquetObs/v1/paquet/infrahoraire-6m?id_station=${stationId}&format=json`;
  const rows = await readJson(await fetchImpl(url, {
    headers: {
      apikey: key,
      accept: 'application/json',
    },
  }));
  return sourceReading(sourceId, clock, parseMeteoFranceObservations(rows));
}

async function fetchPioupiou({ sourceId, beaconId, fetchImpl, clock }) {
  const stop = new Date(clock.now()).toISOString();
  const start = new Date(clock.now() - 48 * 3_600_000).toISOString();
  const [liveJson, archiveJson] = await Promise.all([
    readJson(await fetchImpl(`https://api.pioupiou.fr/v1/live/${beaconId}`)),
    readJson(await fetchImpl(`https://api.pioupiou.fr/v1/archive/${beaconId}?start=${start}&stop=${stop}`)),
  ]);
  return sourceReading(sourceId, clock, parsePioupiouPayload(liveJson, archiveJson));
}

async function fetchCandhis({ sourceId, campaign, fetchImpl, clock }) {
  const html = await readText(await fetchImpl(`https://candhis.cerema.fr/_public_/campagne.php?${campaign}`));
  return sourceReading(sourceId, clock, parseCandhisHtml(html));
}

async function fetchESurfmar({ sourceId, slug, fetchImpl, clock }) {
  const html = await readText(await fetchImpl(`https://esurfmar.meteo.fr/real-time/html/${slug}_data.html`));
  return sourceReading(sourceId, clock, parseESurfmarHtml(html));
}

async function fetchWunderground({ sourceId, stationId, apiKey, fetchImpl, clock }) {
  const baseUrl = 'https://api.weather.com/v2/pws';
  const [liveJson, historyJson] = await Promise.all([
    readJson(await fetchImpl(`${baseUrl}/observations/current?apiKey=${apiKey}&stationId=${stationId}&numericPrecision=decimal&format=json&units=m`)),
    readJson(await fetchImpl(`${baseUrl}/observations/all/1day?apiKey=${apiKey}&stationId=${stationId}&numericPrecision=decimal&format=json&units=m`)),
  ]);
  return sourceReading(sourceId, clock, parseWundergroundPayload(liveJson, historyJson));
}

async function fetchWindsUp({ sourceId, spotId, user, password, fetchImpl, clock }) {
  const mobileBase = 'https://m.winds-up.com';
  const authResponse = await fetchImpl(`${mobileBase}/index.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `action=log&pseudo=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}&submit=submit-value`,
    redirect: 'manual',
  });
  if (!authResponse.ok && authResponse.status !== 302) {
    throw new Error(`windsup_auth_${authResponse.status}`);
  }
  const cookieHeader = authResponse.headers?.get?.('set-cookie') || '';
  const sessionMatch = cookieHeader.match(/PHPSESSID=([^;]+)/);
  if (!sessionMatch) throw new Error('windsup_missing_session');
  const cookie = `PHPSESSID=${sessionMatch[1]}`;
  const html = await readText(await fetchImpl(`${mobileBase}/spot/${spotId}`, {
    headers: {
      Cookie: cookie,
    },
  }));
  return sourceReading(sourceId, clock, parseWindsUpMobileHtml(html));
}

function makeSource(id, pollMs, fetcher) {
  return {
    id,
    pollMs,
    fetch: fetcher,
  };
}

export function createRealWeatherSources({
  clock,
  env = {},
  fetchImpl = globalThis.fetch,
  pollMs = DEFAULT_FAST_POLL_MS,
} = {}) {
  if (!clock || typeof clock.now !== 'function') {
    throw new Error('createRealWeatherSources requires a clock with now()');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('createRealWeatherSources requires fetchImpl');
  }

  const fastPollMs = Math.max(20_000, pollMs);
  const defaultPollMs = Math.max(60_000, pollMs);
  const slowPollMs = DEFAULT_SLOW_POLL_MS;
  const sources = [];

  if (env.METEOFRANCE_KEY) {
    sources.push(
      makeSource('meteofrance_20004002', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20004002',
        sourceId: 'meteofrance_20004002',
        key: env.METEOFRANCE_KEY,
        fetchImpl,
        clock,
      })),
      makeSource('meteofrance_20004003', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20004003',
        sourceId: 'meteofrance_20004003',
        key: env.METEOFRANCE_KEY,
        fetchImpl,
        clock,
      })),
    );
  }

  sources.push(
    makeSource('pioupiou_1202', fastPollMs, () => fetchPioupiou({
      sourceId: 'pioupiou_1202',
      beaconId: '1202',
      fetchImpl,
      clock,
    })),
    makeSource('candhis_revellata', defaultPollMs, () => fetchCandhis({
      sourceId: 'candhis_revellata',
      campaign: 'Y2FtcD0wMkIwNA==',
      fetchImpl,
      clock,
    })),
    makeSource('candhis_bonifacio', defaultPollMs, () => fetchCandhis({
      sourceId: 'candhis_bonifacio',
      campaign: 'Y2FtcD0wMkEwMQ==',
      fetchImpl,
      clock,
    })),
    makeSource('esurfmar_ajaccio', defaultPollMs, () => fetchESurfmar({
      sourceId: 'esurfmar_ajaccio',
      slug: 'ajaccio',
      fetchImpl,
      clock,
    })),
    makeSource('esurfmar_calvi', defaultPollMs, () => fetchESurfmar({
      sourceId: 'esurfmar_calvi',
      slug: 'calvi',
      fetchImpl,
      clock,
    })),
  );

  const wundergroundKey = env.WUNDERGROUND_API_KEY || WUNDERGROUND_API_KEY;
  for (const [sourceId, stationId, sourcePollMs] of [
    ['wunderground_IGROSS105', 'IGROSS105', fastPollMs],
    ['wunderground_ISARROLA7', 'ISARROLA7', fastPollMs],
    ['wunderground_ICORSEPR2', 'ICORSEPR2', slowPollMs],
    ['wunderground_ISARTN1', 'ISARTN1', fastPollMs],
    ['wunderground_IBONIF6', 'IBONIF6', fastPollMs],
  ]) {
    sources.push(makeSource(sourceId, sourcePollMs, () => fetchWunderground({
      sourceId,
      stationId,
      apiKey: wundergroundKey,
      fetchImpl,
      clock,
    })));
  }

  if (env.WINDSUP_USER && env.WINDSUP_PASS) {
    sources.push(makeSource('windsup_porticcio', fastPollMs, () => fetchWindsUp({
      sourceId: 'windsup_porticcio',
      spotId: '1726',
      user: env.WINDSUP_USER,
      password: env.WINDSUP_PASS,
      fetchImpl,
      clock,
    })));
  }

  return sources;
}
