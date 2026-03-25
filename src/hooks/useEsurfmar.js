import { useState, useCallback } from 'react';
import { getCached, setCache } from '../utils/sessionCache';
import { CACHE_TTL, ESURFMAR_STATION } from '../config/sources';

/**
 * Parses eSurfmar HTML table for wave data (Golfe d'Ajaccio buoy).
 */
function parseEsurfmarHtml(html) {
  const rowMatch = html.match(/<tr bgcolor=#[F0-9A-Fa-f]{6}>\s*(<td class="data"(.|[\n])*?)<\/tr>/i);
  if (!rowMatch) return null;

  const rowHtml = rowMatch[1];
  const tdRegex = /<td[^>]*>(.*?)<\/td>/gs;
  const tds = [];
  let tdMatch;
  while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
    const text = tdMatch[1].replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, '').trim();
    tds.push(text);
  }

  if (tds.length >= 11) {
    return {
      direction: tds[1] || null,
      period: tds[8] || null,
      height: tds[9] || null,
      hmax: tds[10] || null,
      waterTemp: tds[5] || null
    };
  }
  return null;
}

export function useEsurfmar() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const cacheKey = 'esurfmar_ajaccio';
      const cached = getCached(cacheKey, CACHE_TTL);
      if (cached) {
        setData(cached);
        return;
      }

      const res = await fetch(ESURFMAR_STATION.url, { cache: 'no-store' });
      if (!res.ok) return;

      const html = await res.text();
      const parsed = parseEsurfmarHtml(html);
      if (parsed) {
        setCache(cacheKey, parsed);
        setData(parsed);
      }
    } catch (e) {
      console.error('Esurfmar fetch error', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, fetchData };
}
