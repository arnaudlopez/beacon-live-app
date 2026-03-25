import { useState, useCallback } from 'react';
import { getCached, setCache } from '../utils/sessionCache';
import { CACHE_TTL } from '../config/sources';

/**
 * Parses CANDHIS HTML page for wave and temperature data.
 * arrDataPHP[0] = wave height, [1] = period, [2] = direction, [4] = water temp
 */
function parseCandhisHtml(html) {
  let waterTemp = null;
  let waterHistory = [];
  let surf = null;

  const matchTemp = html.match(/arrDataPHP\[4\]\s*=\s*eval\('(\[.*?\])'\);/);
  if (matchTemp && matchTemp[1]) {
    const arr = JSON.parse(matchTemp[1]);
    if (arr && arr.length > 0) {
      waterTemp = arr[0][1];
      waterHistory = arr.map(item => ({
        time: new Date(item[0].replace(' ', 'T')).getTime(),
        waterTemp: item[1]
      }));
    }
  }

  const matchH = html.match(/arrDataPHP\[0\]\s*=\s*eval\('(\[.*?\])'\);/);
  const matchP = html.match(/arrDataPHP\[1\]\s*=\s*eval\('(\[.*?\])'\);/);
  const matchD = html.match(/arrDataPHP\[2\]\s*=\s*eval\('(\[.*?\])'\);/);

  if (matchH && matchP && matchD) {
    const arrH = JSON.parse(matchH[1]);
    const arrP = JSON.parse(matchP[1]);
    const arrD = JSON.parse(matchD[1]);
    if (arrH.length > 0 && arrP.length > 0 && arrD.length > 0) {
      surf = {
        height: arrH[0][1],
        hmax: arrH[0][3],
        period: arrP[0][1],
        direction: arrD[0][1]
      };
    }
  }

  return { waterTemp, waterHistory, surf };
}

async function fetchCandhisStation(stationB64) {
  const cacheKey = `candhis_${stationB64}`;
  const cached = getCached(cacheKey, CACHE_TTL);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/candhis/_public_/campagne.php?${stationB64}`, { cache: 'no-store' });
    if (!res.ok) return { waterTemp: null, waterHistory: [], surf: null };

    const html = await res.text();
    const result = parseCandhisHtml(html);
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error('Candhis fetch error', e);
    return { waterTemp: null, waterHistory: [], surf: null };
  }
}

export function useCandhis(stations) {
  const [results, setResults] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await Promise.all(
        Object.entries(stations).map(async ([key, station]) => {
          const data = await fetchCandhisStation(station.id);
          return [key, data];
        })
      );
      setResults(Object.fromEntries(entries));
    } finally {
      setIsLoading(false);
    }
  }, [stations]);

  return { results, isLoading, fetchAll };
}
