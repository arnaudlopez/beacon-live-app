import { useState, useCallback } from 'react';
import { getCached, setCache } from '../utils/sessionCache';
import { CACHE_TTL } from '../config/sources';

/**
 * Fetches weather data from a Météo-France infrahoraire station.
 * Returns { live, history } for a given stationId.
 */
function parseMeteoFranceData(data) {
  if (!data || data.length === 0) return null;

  const latest = data[0];
  const windSpeedKts = latest.ff ? (latest.ff * 1.94384).toFixed(1) : 0;
  const windGustKts = latest.fxi10
    ? (latest.fxi10 * 1.94384).toFixed(1)
    : (latest.fxi ? (latest.fxi * 1.94384).toFixed(1) : windSpeedKts);
  const tempC = latest.t ? (latest.t - 273.15).toFixed(1) : null;
  const pressureHpa = latest.pmer ? (latest.pmer / 100).toFixed(1) : null;

  const live = {
    windSpeed: windSpeedKts,
    windGust: windGustKts,
    windDirection: latest.dd || 0,
    temperature: tempC,
    humidity: latest.u || null,
    pressure: pressureHpa,
  };

  const history = data.map(item => {
    const spd = item.ff ? item.ff * 1.94384 : 0;
    const gustVal = item.fxi10 || item.fxi || item.ff || 0;
    const gst = gustVal * 1.94384;
    return {
      time: item.validity_time || item.reference_time,
      avgSpeed: Number(spd.toFixed(1)),
      maxGust: Number(gst.toFixed(1)),
      temperature: item.t ? Number((item.t - 273.15).toFixed(1)) : null,
      windDirection: item.dd !== undefined ? item.dd : null
    };
  }).reverse();

  return { live, history };
}

async function fetchStation(stationId) {
  const cacheKey = `meteofrance_${stationId}`;
  const cached = getCached(cacheKey, CACHE_TTL);
  if (cached) return cached;

  try {
    const METEO_FRANCE_KEY = import.meta.env.VITE_METEOFRANCE_KEY;
    const response = await fetch(
      `/api/meteofrance/public/DPPaquetObs/v1/paquet/infrahoraire-6m?id_station=${stationId}&format=json`,
      {
        cache: 'no-store',
        headers: {
          'apikey': METEO_FRANCE_KEY,
          'accept': 'application/json'
        }
      }
    );
    if (!response.ok) {
      console.warn(`Météo-France station ${stationId}: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    const result = parseMeteoFranceData(data);
    if (result) setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error('Meteo France fetch error', e);
    return null;
  }
}

export function useMeteoFrance(stationIds) {
  const [results, setResults] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await Promise.all(
        stationIds.map(async (id) => [id, await fetchStation(id)])
      );
      setResults(Object.fromEntries(entries));
    } finally {
      setIsLoading(false);
    }
  }, [stationIds]);

  return { results, isLoading, fetchAll };
}
