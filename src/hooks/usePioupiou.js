import { useState, useCallback } from 'react';
import { getCached, setCache } from '../utils/sessionCache';
import { CACHE_TTL } from '../config/sources';

/**
 * Fetches live + historical wind data from a Pioupiou station.
 * Wind speeds are converted from km/h to knots.
 */
async function fetchPioupiouStation(stationId) {
  const cacheKey = `pioupiou_${stationId}`;
  const cached = getCached(cacheKey, CACHE_TTL);
  if (cached) return cached;

  try {
    const liveRes = await fetch(`https://api.pioupiou.fr/v1/live/${stationId}`, { cache: 'no-store' });
    if (!liveRes.ok) return null;

    const liveJson = await liveRes.json();
    const measurements = liveJson.data?.measurements;
    if (!measurements) return null;

    const live = {
      windSpeed: (measurements.wind_speed_avg / 1.852).toFixed(1),
      windGust: (measurements.wind_speed_max / 1.852).toFixed(1),
      windDirection: measurements.wind_heading,
      temperature: null,
      humidity: null,
      pressure: null,
    };

    let history = [];
    const histRes = await fetch(`https://api.pioupiou.fr/v1/archive/${stationId}`, { cache: 'no-store' });
    if (histRes.ok) {
      const histJson = await histRes.json();
      history = (histJson.data || []).map(item => ({
        time: item[0],
        avgSpeed: item[4] !== null ? Number((item[4] / 1.852).toFixed(1)) : 0,
        maxGust: item[5] !== null ? Number((item[5] / 1.852).toFixed(1)) : 0
      }));
    }

    const result = { live, history };
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error('Pioupiou fetch error', e);
    return null;
  }
}

export function usePioupiou(stationId) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchPioupiouStation(stationId);
      setData(result);
    } finally {
      setIsLoading(false);
    }
  }, [stationId]);

  return { data, isLoading, fetchData };
}
