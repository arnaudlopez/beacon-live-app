import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

/**
 * Hybrid data hook: initial fetch via Edge Function + Supabase Realtime push.
 * 
 * Flow:
 * 1. On mount: fetch all data via Edge Function (full payload with history)
 * 2. Subscribe to weather_cache table changes via Supabase Realtime
 * 3. On UPDATE event: merge the changed source into state instantly
 * 4. Fallback: poll every 60s in case Realtime drops
 * 
 * Returns: { windData, surfData, waterData, isLoading, lastUpdated, error, isRealtime }
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const EDGE_FUNCTION_URL = SUPABASE_URL + '/functions/v1/weather-cache';

// Fallback polling interval (only used if Realtime is down)
const FALLBACK_POLL_MS = 60_000;
const MARINE_POLL_MS = 120_000;

// Map edge function source keys → app source IDs
const WIND_SOURCE_MAP = {
  'lfkj': 'meteofrance_20004002',
  'la_parata': 'meteofrance_20004003',
  'owm-1202': 'pioupiou_1202',
  'porticcio': 'windsup_porticcio',
  'porticcio_haut': 'wunderground_IGROSS105',
};

const WIND_EDGE_KEYS = Object.values(WIND_SOURCE_MAP);
const MARINE_SOURCES = ['candhis_revellata', 'candhis_bonifacio', 'esurfmar_ajaccio'];

// Create Supabase client (singleton)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function useWeatherData() {
  const [windData, setWindData] = useState({});
  const [surfData, setSurfData] = useState({});
  const [waterData, setWaterData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [error, setError] = useState('');
  const [isRealtime, setIsRealtime] = useState(false);

  const channelRef = useRef(null);

  // Edge Function fetch (full payload with history)
  const fetchFromEdge = useCallback(async (sources) => {
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
  }, []);

  // Map edge keys → app IDs for wind data
  const mapWindData = useCallback((data) => {
    const mapped = {};
    for (const [appId, edgeKey] of Object.entries(WIND_SOURCE_MAP)) {
      mapped[appId] = data[edgeKey] || null;
    }
    return mapped;
  }, []);

  // Process marine data
  const processMarine = useCallback((data) => {
    const rev = data.candhis_revellata;
    const bon = data.candhis_bonifacio;
    const esurf = data.esurfmar_ajaccio;

    if (rev) {
      setWaterData({ current: rev.waterTemp, history: rev.waterHistory || [] });
    }

    setSurfData({
      revellata: rev?.surf ? { ...rev.surf, waterTemp: rev.waterTemp, surfHistory: rev.surfHistory || [] } : null,
      bonifacio: bon?.surf ? { ...bon.surf, waterTemp: bon.waterTemp, surfHistory: bon.surfHistory || [] } : null,
      ajaccio: esurf ? { ...esurf, surfHistory: esurf.surfHistory || [] } : null,
    });
  }, []);

  // Initial fetch + setup Realtime
  useEffect(() => {
    let cancelled = false;

    // --- 1. Initial full fetch ---
    const initialFetch = async () => {
      const [windRaw, marineRaw] = await Promise.all([
        fetchFromEdge(WIND_EDGE_KEYS),
        fetchFromEdge(MARINE_SOURCES),
      ]);

      if (cancelled) return;

      if (windRaw) {
        setWindData(mapWindData(windRaw));
      }
      if (marineRaw) {
        processMarine(marineRaw);
      }
      setLastUpdated(new Date());
      setError('');
      setIsLoading(false);
    };

    initialFetch();

    // --- 2. Subscribe to Realtime changes on weather_cache ---
    const channel = supabase
      .channel('weather-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'weather_cache',
        },
        (payload) => {
          const { source, data } = payload.new;
          console.log(`⚡ Realtime push: ${source}`);

          // Check if it's a wind source
          const windEntry = Object.entries(WIND_SOURCE_MAP).find(([, edgeKey]) => edgeKey === source);
          if (windEntry) {
            const [appId] = windEntry;
            setWindData(prev => ({ ...prev, [appId]: data }));
            setLastUpdated(new Date());
            setIsRealtime(true);
            // Reset the realtime indicator after 3s
            setTimeout(() => setIsRealtime(false), 3000);
            return;
          }

          // Check if it's a marine source
          if (MARINE_SOURCES.includes(source)) {
            // Re-fetch full marine to maintain consistency
            fetchFromEdge(MARINE_SOURCES).then(marineRaw => {
              if (marineRaw) processMarine(marineRaw);
            });
            setLastUpdated(new Date());
            return;
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status);
      });

    channelRef.current = channel;

    // --- 3. Fallback polling (safety net) ---
    const fallbackInterval = setInterval(async () => {
      const data = await fetchFromEdge(WIND_EDGE_KEYS);
      if (data && !cancelled) {
        setWindData(mapWindData(data));
        setLastUpdated(new Date());
        setError('');
      }
    }, FALLBACK_POLL_MS);

    const marineInterval = setInterval(async () => {
      const data = await fetchFromEdge(MARINE_SOURCES);
      if (data && !cancelled) {
        processMarine(data);
      }
    }, MARINE_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(fallbackInterval);
      clearInterval(marineInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchFromEdge, mapWindData, processMarine]);

  return { windData, surfData, waterData, isLoading, lastUpdated, error, isRealtime };
}
