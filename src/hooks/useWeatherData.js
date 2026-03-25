import { useState, useEffect, useRef } from 'react';

/**
 * Single hook that fetches ALL weather/marine data from the Supabase Edge Function.
 * The Edge Function handles upstream API caching server-side (6min TTL).
 *
 * Returns: { windData, surfData, waterData, isLoading, lastUpdated, error }
 */

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/weather-cache';

// How often the client polls the edge function
const WEATHER_POLL_MS = 30_000;  // 30s for wind data
const MARINE_POLL_MS  = 60_000;  // 60s for marine data

// Map edge function source keys → app source IDs
const WIND_SOURCE_MAP = {
  'lfkj': 'meteofrance_20004002',
  'la_parata': 'meteofrance_20004003',
  'owm-1202': 'pioupiou_1202',
  'porticcio': 'windsup_porticcio',
};

export function useWeatherData() {
  const [windData, setWindData] = useState({});
  const [surfData, setSurfData] = useState({});
  const [waterData, setWaterData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [error, setError] = useState('');

  const fetchRef = useRef(null);

  useEffect(() => {
    fetchRef.current = async (sources) => {
      try {
        const res = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data || {};
      } catch (err) {
        console.error('Edge function fetch error:', err);
        setError(`Connexion serveur échouée: ${err.message}`);
        return null;
      }
    };
  });

  // Fetch wind data (weather stations)
  useEffect(() => {
    let cancelled = false;
    const windSources = Object.values(WIND_SOURCE_MAP);

    const fetchWind = async () => {
      const data = await fetchRef.current?.(windSources);
      if (!data || cancelled) return;

      // Transform edge function keys → app source IDs
      const mapped = {};
      for (const [appId, edgeKey] of Object.entries(WIND_SOURCE_MAP)) {
        mapped[appId] = data[edgeKey] || null;
      }
      setWindData(mapped);
      setLastUpdated(new Date());
      setError('');
      setIsLoading(false);
    };

    fetchWind();
    const interval = setInterval(fetchWind, WEATHER_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Fetch marine data (CANDHIS, eSurfmar)
  useEffect(() => {
    let cancelled = false;
    const marineSources = ['candhis_revellata', 'candhis_bonifacio', 'esurfmar_ajaccio'];

    const fetchMarine = async () => {
      const data = await fetchRef.current?.(marineSources);
      if (!data || cancelled) return;

      const rev = data.candhis_revellata;
      const bon = data.candhis_bonifacio;
      const esurf = data.esurfmar_ajaccio;

      if (rev) {
        setWaterData({ current: rev.waterTemp, history: rev.waterHistory || [] });
      }

      setSurfData({
        revellata: rev?.surf ? { ...rev.surf, waterTemp: rev.waterTemp } : null,
        bonifacio: bon?.surf ? { ...bon.surf, waterTemp: bon.waterTemp } : null,
        ajaccio: esurf ? { ...esurf } : null,
      });
    };

    fetchMarine();
    const interval = setInterval(fetchMarine, MARINE_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { windData, surfData, waterData, isLoading, lastUpdated, error };
}
