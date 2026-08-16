const DEFAULT_FAST_POLL_MS = 30_000;
const DEFAULT_SLOW_POLL_MS = 15 * 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
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

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function toCelsiusFromKelvin(value) {
  const numberValue = firstFiniteNumber(value);
  if (numberValue === null) return null;
  return Number((numberValue - 273.15).toFixed(1));
}

function toIsoNoMillis(time) {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function observedAtFromPayload(payload, fallback) {
  const history = payload?.history || payload?.surfHistory || payload?.waterHistory || [];
  const last = history.at?.(-1);
  if (last?.time) return new Date(last.time).toISOString();
  if (payload?.live) return new Date(fallback).toISOString();
  return null;
}

async function readJson(response) {
  if (!response.ok) throw new Error(`upstream_http_${response.status}`);
  try {
    if (typeof response.text === 'function') {
      const body = await response.text();
      if (!body.trim()) throw new Error('empty_body');
      return JSON.parse(body);
    }
    return await response.json();
  } catch (error) {
    const reason = error?.message === 'empty_body' ? 'empty_body' : 'malformed_body';
    throw new Error(`upstream_invalid_json_${reason}`, { cause: error });
  }
}

async function readText(response) {
  if (!response.ok) throw new Error(`upstream_http_${response.status}`);
  return response.text();
}

function createTimedFetch(fetchImpl, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  return async (url, init = {}) => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(`upstream_timeout_${timeoutMs}ms`));
      }, timeoutMs);
      controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
    });
    const request = Promise.resolve().then(async () => {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
      if (typeof response?.arrayBuffer !== 'function') return response;
      const body = await response.arrayBuffer();
      const bodyAllowed = ![204, 205, 304].includes(response.status);
      return new Response(bodyAllowed ? body : null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });

    try {
      return await Promise.race([request, timeout]);
    } catch (error) {
      if (timedOut) throw new Error(`upstream_timeout_${timeoutMs}ms`, { cause: error });
      throw error;
    } finally {
      controller.abort();
    }
  };
}

async function fetchJson(fetchImpl, url, init) {
  return readJson(await fetchImpl(url, init));
}

export function parseMeteoFranceObservations(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[0];
  const latestGust = firstFiniteNumber(latest.raf10, latest.fxi10, latest.fxi);

  return {
    live: {
      windSpeed: latest.ff ? toKtsFromMs(latest.ff) : '0',
      windGust: latestGust !== null ? toKtsFromMs(latestGust) : null,
      windDirection: latest.dd || 0,
      temperature: latest.t ? (Number(latest.t) - 273.15).toFixed(1) : null,
      humidity: latest.u || null,
      pressure: latest.pmer ? (Number(latest.pmer) / 100).toFixed(1) : null,
    },
    history: rows.map((item) => {
      const speed = item.ff ? Number(item.ff) * 1.94384 : 0;
      const gust = firstFiniteNumber(item.raf10, item.fxi10, item.fxi);
      return {
        time: item.validity_time || item.reference_time,
        avgSpeed: Number(speed.toFixed(1)),
        maxGust: gust !== null ? Number((gust * 1.94384).toFixed(1)) : null,
        temperature: item.t ? Number((Number(item.t) - 273.15).toFixed(1)) : null,
        windDirection: item.dd ?? null,
      };
    }).reverse(),
  };
}

export function parseMeteoFranceBuoyObservations(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const sorted = [...rows]
    .filter((row) => row?.validity_time || row?.reference_time)
    .sort((a, b) => new Date(a.validity_time || a.reference_time).getTime() - new Date(b.validity_time || b.reference_time).getTime());
  const latest = sorted.at(-1);
  if (!latest) return null;

  const wavePeriod = (row) => {
    const averagePeriod = firstFiniteNumber(row.per_moy_vag);
    if (averagePeriod !== null) return averagePeriod;
    const peakPeriod = firstFiniteNumber(row.per);
    return peakPeriod !== null && peakPeriod >= 0 ? peakPeriod : null;
  };

  const surfHistory = sorted.map((row) => ({
    time: new Date(row.validity_time || row.reference_time).getTime(),
    height: firstFiniteNumber(row.haut_vag),
    hmax: firstFiniteNumber(row.hmax_vag, row.haut_max_vag),
    period: wavePeriod(row),
    direction: firstFiniteNumber(row.dir_vag),
    waterTemp: toCelsiusFromKelvin(row.tmer),
  }));

  const history = sorted.map((row) => ({
    time: new Date(row.validity_time || row.reference_time).getTime(),
    avgSpeed: firstFiniteNumber(row.ff) !== null ? Number(toKtsFromMs(row.ff)) : 0,
    maxGust: firstFiniteNumber(row.rafper) !== null ? Number(toKtsFromMs(row.rafper)) : null,
    temperature: row.t ? Number((Number(row.t) - 273.15).toFixed(1)) : null,
    windDirection: firstFiniteNumber(row.dd),
  }));

  const surf = {
    height: firstFiniteNumber(latest.haut_vag),
    hmax: firstFiniteNumber(latest.hmax_vag, latest.haut_max_vag),
    period: wavePeriod(latest),
    direction: firstFiniteNumber(latest.dir_vag),
  };

  return {
    ...surf,
    surf,
    waterTemp: toCelsiusFromKelvin(latest.tmer),
    surfHistory,
    waterHistory: surfHistory
      .filter((row) => row.waterTemp !== null)
      .map((row) => ({ time: row.time, waterTemp: row.waterTemp })),
    live: {
      windSpeed: firstFiniteNumber(latest.ff) !== null ? toKtsFromMs(latest.ff) : '0',
      windGust: firstFiniteNumber(latest.rafper) !== null ? toKtsFromMs(latest.rafper) : null,
      windDirection: firstFiniteNumber(latest.dd),
      temperature: latest.t ? (Number(latest.t) - 273.15).toFixed(1) : null,
      humidity: latest.u ?? null,
      pressure: latest.pmer ? (Number(latest.pmer) / 100).toFixed(1) : null,
    },
    history,
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
  const observationLineRegex = /<div\b[^>]*class=["'][^"']*\bspotObsLine\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bspotObsLine\b|$)/gi;
  const parisTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  function normalizeHourMinute(value) {
    const [hour, minute] = value.split(':');
    return `${hour.padStart(2, '0')}:${minute}`;
  }

  function normalizeDegree(value) {
    const degree = Number.parseInt(value, 10);
    if (!Number.isFinite(degree) || degree < 0 || degree > 360) return null;
    return degree;
  }

  function hourMinuteFromTimestamp(time) {
    return normalizeHourMinute(parisTimeFormatter.format(new Date(time)));
  }

  const degreeByMinute = new Map();
  let lineMatch;
  while ((lineMatch = observationLineRegex.exec(html)) !== null) {
    const block = lineMatch[1];
    const text = block.replace(/<[^>]+>/g, ' ');
    const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);
    const degreeMatch = block.match(/class=["'][^"']*\bdeg\b[^"']*["'][^>]*>\s*(\d{1,3})\s*</i);
    if (timeMatch && degreeMatch) {
      degreeByMinute.set(normalizeHourMinute(timeMatch[1]), normalizeDegree(degreeMatch[1]));
    }
  }

  const avgByTime = new Map();
  const gustByTime = new Map();
  let match;
  while ((match = avgRegex.exec(html)) !== null) {
    const time = Number(match[1]);
    avgByTime.set(Number(match[1]), {
      avgSpeed: Number(match[2]),
      windDirection: degreeByMinute.get(hourMinuteFromTimestamp(time)) ?? null,
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
  const headers = {
    apikey: key,
    accept: 'application/json',
  };
  const v2Url = `https://public-api.meteofrance.fr/public/DPPaquetObs/v2/paquet/infrahoraire-6m?id_station=${stationId}&format=json`;
  const v1Url = `https://public-api.meteofrance.fr/public/DPPaquetObs/v1/paquet/infrahoraire-6m?id_station=${stationId}&format=json`;
  let response = await fetchImpl(v2Url, { headers });

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    response = await fetchImpl(v1Url, { headers });
  }

  const rows = await readJson(response);
  return sourceReading(sourceId, clock, parseMeteoFranceObservations(rows));
}

async function fetchMeteoFranceBuoy({ sourceId, buoyId, key, fetchImpl, clock }) {
  const end = Math.floor(clock.now() / 3_600_000) * 3_600_000;
  const start = end - 48 * 3_600_000;
  const params = new URLSearchParams({
    format: 'json',
    id_bouees: buoyId,
    date_debut: toIsoNoMillis(start),
    date_fin: toIsoNoMillis(end),
  });
  const url = `https://public-api.meteofrance.fr/public/DPObs/v2/bouees?${params.toString()}`;
  const rows = await fetchJson(fetchImpl, url, {
    headers: {
      apikey: key,
      accept: 'application/json',
    },
  });
  return sourceReading(sourceId, clock, parseMeteoFranceBuoyObservations(rows));
}

async function fetchPioupiou({ sourceId, beaconId, fetchImpl, clock }) {
  const stop = new Date(clock.now()).toISOString();
  const start = new Date(clock.now() - 48 * 3_600_000).toISOString();
  const [liveJson, archiveJson] = await Promise.all([
    fetchJson(fetchImpl, `https://api.pioupiou.fr/v1/live/${beaconId}`),
    fetchJson(fetchImpl, `https://api.pioupiou.fr/v1/archive/${beaconId}?start=${start}&stop=${stop}`),
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
  const [currentJson, historyJson] = await Promise.all([
    fetchImpl(`${baseUrl}/observations/current?apiKey=${apiKey}&stationId=${stationId}&numericPrecision=decimal&format=json&units=m`)
      .then((response) => response.status === 204 ? null : readJson(response)),
    fetchJson(fetchImpl, `${baseUrl}/observations/all/1day?apiKey=${apiKey}&stationId=${stationId}&numericPrecision=decimal&format=json&units=m`),
  ]);
  const latestHistoryObservation = [...(historyJson?.observations ?? [])]
    .sort((left, right) => new Date(right.obsTimeUtc).getTime() - new Date(left.obsTimeUtc).getTime())[0];
  const historyMetric = latestHistoryObservation?.metric;
  const liveJson = currentJson ?? (latestHistoryObservation
    ? { observations: [{
        ...latestHistoryObservation,
        winddir: latestHistoryObservation.winddir ?? latestHistoryObservation.winddirAvg,
        metric: {
          ...historyMetric,
          windSpeed: historyMetric?.windSpeed ?? historyMetric?.windspeedAvg,
          windGust: historyMetric?.windGust ?? historyMetric?.windgustHigh,
          temp: historyMetric?.temp ?? historyMetric?.tempAvg,
          pressure: historyMetric?.pressure ?? historyMetric?.pressureMax,
        },
      }] }
    : null);
  if (!liveJson) throw new Error('wunderground_no_observations');
  return sourceReading(sourceId, clock, parseWundergroundPayload(liveJson, historyJson));
}

const WINDSUP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WINDSUP_BASE_URL = 'https://www.winds-up.com';
const WINDSUP_PREMIUM_SESSION_TTL_MS = 30 * 60_000;
const WINDSUP_PREMIUM_RETRY_MS = 15 * 60_000;

function parseSetCookie(header, jar) {
  if (!header) return;
  const parts = header.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const part of parts) {
    const match = part.trim().match(/^([^=;\s]+)=([^;]*)/);
    if (match) jar[match[1]] = match[2];
  }
}

function jarToHeader(jar) {
  return Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ');
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function createWindsUpClient({
  fetchImpl,
  clock,
  premiumEnabled = false,
  user = '',
  password = '',
}) {
  const commonHeaders = {
    'User-Agent': WINDSUP_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  };
  let premiumCookie = null;
  let premiumSessionCreatedAt = 0;
  let premiumRetryAt = 0;
  let premiumLoginPromise = null;
  let missingCredentialsReported = false;

  function reportPremiumFallback(error) {
    globalThis.console?.warn?.(
      `WindsUp premium unavailable; using delayed public observations: ${error.message}`,
    );
  }

  async function authenticatePremium() {
    const jar = {};
    const initResponse = await fetchImpl(`${WINDSUP_BASE_URL}/connexion`, {
      headers: commonHeaders,
      redirect: 'manual',
    });
    if (!initResponse.ok && initResponse.status !== 302) {
      throw new Error(`windsup_init_${initResponse.status}`);
    }
    parseSetCookie(initResponse.headers?.get?.('set-cookie') || '', jar);

    const authResponse = await fetchImpl(`${WINDSUP_BASE_URL}/v2/`, {
      method: 'POST',
      headers: {
        ...commonHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: WINDSUP_BASE_URL,
        Referer: `${WINDSUP_BASE_URL}/connexion`,
        Cookie: jarToHeader(jar),
        'Upgrade-Insecure-Requests': '1',
      },
      body: `action=log&pseudo=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}&submit=submit-value`,
      redirect: 'manual',
    });
    if (!authResponse.ok && authResponse.status !== 302) {
      throw new Error(`windsup_auth_${authResponse.status}`);
    }
    parseSetCookie(authResponse.headers?.get?.('set-cookie') || '', jar);
    if (!jar.codeCnx || !jar.autolog) throw new Error('windsup_missing_premium_session');
    return jarToHeader(jar);
  }

  async function getPremiumCookie() {
    if (!premiumEnabled) return null;
    if (!user || !password) {
      if (!missingCredentialsReported) {
        missingCredentialsReported = true;
        reportPremiumFallback(new Error('windsup_premium_credentials_missing'));
      }
      return null;
    }

    const now = clock.now();
    if (premiumCookie && now - premiumSessionCreatedAt < WINDSUP_PREMIUM_SESSION_TTL_MS) {
      return premiumCookie;
    }
    if (now < premiumRetryAt) return null;

    if (!premiumLoginPromise) {
      premiumLoginPromise = authenticatePremium()
        .then((cookie) => {
          premiumCookie = cookie;
          premiumSessionCreatedAt = clock.now();
          premiumRetryAt = 0;
          return cookie;
        })
        .catch((error) => {
          premiumCookie = null;
          premiumRetryAt = clock.now() + WINDSUP_PREMIUM_RETRY_MS;
          reportPremiumFallback(error);
          return null;
        })
        .finally(() => {
          premiumLoginPromise = null;
        });
    }
    return premiumLoginPromise;
  }

  async function fetchPage(spotId, cookie = null) {
    const html = await readText(await fetchImpl(`${WINDSUP_BASE_URL}/spot/${spotId}`, {
      headers: cookie ? { ...commonHeaders, Cookie: cookie } : commonHeaders,
    }));
    return parseWindsUpMobileHtml(html);
  }

  async function fetchSource({ sourceId, spotId }) {
    const cookie = await getPremiumCookie();
    if (cookie) {
      try {
        const payload = await fetchPage(spotId, cookie);
        if (payload) return sourceReading(sourceId, clock, payload);
        throw new Error('windsup_no_premium_observations');
      } catch (error) {
        premiumCookie = null;
        premiumRetryAt = clock.now() + WINDSUP_PREMIUM_RETRY_MS;
        reportPremiumFallback(error);
      }
    }

    const payload = await fetchPage(spotId);
    if (!payload) throw new Error('windsup_no_public_observations');
    return sourceReading(sourceId, clock, payload);
  }

  return { fetchSource };
}

function makeSource(id, pollMs, fetcher) {
  return {
    id,
    pollMs,
    fetch: fetcher,
  };
}

export function parseDisabledSourceIds(value = '') {
  return new Set(String(value)
    .split(',')
    .map((sourceId) => sourceId.trim())
    .filter(Boolean));
}

export function createRealWeatherSources({
  clock,
  env = {},
  fetchImpl = globalThis.fetch,
  pollMs = DEFAULT_FAST_POLL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  if (!clock || typeof clock.now !== 'function') {
    throw new Error('createRealWeatherSources requires a clock with now()');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('createRealWeatherSources requires fetchImpl');
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('createRealWeatherSources requires a positive requestTimeoutMs');
  }

  const timedFetch = createTimedFetch(fetchImpl, requestTimeoutMs);

  const fastPollMs = Math.max(20_000, pollMs);
  const defaultPollMs = Math.max(60_000, pollMs);
  const publicWindsUpPollMs = Math.max(2 * 60_000, pollMs);
  const slowPollMs = DEFAULT_SLOW_POLL_MS;
  const sources = [];
  const disabledSourceIds = parseDisabledSourceIds(env.WEATHER_DISABLED_SOURCE_IDS);
  const windsUpPremiumEnabled = isEnabled(env.WINDSUP_PREMIUM_ENABLED);
  const windsUpClient = createWindsUpClient({
    fetchImpl: timedFetch,
    clock,
    premiumEnabled: windsUpPremiumEnabled,
    user: env.WINDSUP_USER,
    password: env.WINDSUP_PASS,
  });

  if (env.METEOFRANCE_KEY) {
    sources.push(
      makeSource('meteofrance_20004002', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20004002',
        sourceId: 'meteofrance_20004002',
        key: env.METEOFRANCE_KEY,
        fetchImpl: timedFetch,
        clock,
      })),
      makeSource('meteofrance_20004003', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20004003',
        sourceId: 'meteofrance_20004003',
        key: env.METEOFRANCE_KEY,
        fetchImpl: timedFetch,
        clock,
      })),
      makeSource('meteofrance_20114002', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20114002',
        sourceId: 'meteofrance_20114002',
        key: env.METEOFRANCE_KEY,
        fetchImpl: timedFetch,
        clock,
      })),
      makeSource('meteofrance_20093002', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20093002',
        sourceId: 'meteofrance_20093002',
        key: env.METEOFRANCE_KEY,
        fetchImpl: timedFetch,
        clock,
      })),
      makeSource('meteofrance_20107001', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20107001',
        sourceId: 'meteofrance_20107001',
        key: env.METEOFRANCE_KEY,
        fetchImpl: timedFetch,
        clock,
      })),
      makeSource('meteofrance_20342001', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20342001',
        sourceId: 'meteofrance_20342001',
        key: env.METEOFRANCE_KEY,
        fetchImpl: timedFetch,
        clock,
      })),
      makeSource('meteofrance_20041001', defaultPollMs, () => fetchMeteoFrance({
        stationId: '20041001',
        sourceId: 'meteofrance_20041001',
        key: env.METEOFRANCE_KEY,
        fetchImpl: timedFetch,
        clock,
      })),
    );
  }

  sources.push(
    makeSource('pioupiou_1202', fastPollMs, () => fetchPioupiou({
      sourceId: 'pioupiou_1202',
      beaconId: '1202',
      fetchImpl: timedFetch,
      clock,
    })),
    makeSource('candhis_revellata', defaultPollMs, () => fetchCandhis({
      sourceId: 'candhis_revellata',
      campaign: 'Y2FtcD0wMkIwNA==',
      fetchImpl: timedFetch,
      clock,
    })),
    makeSource('candhis_bonifacio', defaultPollMs, () => fetchCandhis({
      sourceId: 'candhis_bonifacio',
      campaign: 'Y2FtcD0wMkEwMQ==',
      fetchImpl: timedFetch,
      clock,
    })),
    makeSource('candhis_alistro', defaultPollMs, () => fetchCandhis({
      sourceId: 'candhis_alistro',
      campaign: 'Y2FtcD0wMkIwNQ==',
      fetchImpl: timedFetch,
      clock,
    })),
    makeSource('esurfmar_ajaccio', defaultPollMs, async () => {
      if (env.METEOFRANCE_KEY) {
        try {
          return await fetchMeteoFranceBuoy({
            sourceId: 'esurfmar_ajaccio',
            buoyId: '6101031',
            key: env.METEOFRANCE_KEY,
            fetchImpl: timedFetch,
            clock,
          });
        } catch (err) {
          void err;
          // Keep the legacy eSurfMar parser as a resilience fallback.
        }
      }
      return fetchESurfmar({
        sourceId: 'esurfmar_ajaccio',
        slug: 'ajaccio',
        fetchImpl: timedFetch,
        clock,
      });
    }),
    makeSource('esurfmar_calvi', defaultPollMs, () => fetchESurfmar({
      sourceId: 'esurfmar_calvi',
      slug: 'calvi',
      fetchImpl: timedFetch,
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
      fetchImpl: timedFetch,
      clock,
    })));
  }

  for (const [sourceId, spotId] of [
    ['windsup_porticcio', '1726'],
    ['windsup_tonnara', '51'],
    ['windsup_porto_polo', '84'],
    ['windsup_piantarella', '1659'],
    ['windsup_santa_manza', '1549'],
    ['windsup_balistra', '1693'],
    ['windsup_figari_eole', '1661'],
  ]) {
    sources.push(makeSource(
      sourceId,
      windsUpPremiumEnabled ? fastPollMs : publicWindsUpPollMs,
      () => windsUpClient.fetchSource({
        sourceId,
        spotId,
      }),
    ));
  }

  return sources.filter((source) => !disabledSourceIds.has(source.id));
}
