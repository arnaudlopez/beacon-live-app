import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

/**
 * @typedef {import('../types').AllWindData} AllWindData
 * @typedef {import('../types').AllSurfData} AllSurfData
 * @typedef {import('../types').WaterData} WaterData
 */

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
const BACKEND_URL = import.meta.env.VITE_WEATHER_BACKEND_URL;

// Fallback polling interval (only used if Realtime is down)
const FALLBACK_POLL_MS = 60_000;
const MARINE_POLL_MS = 120_000;

// Map edge function source keys → app source IDs
const WIND_SOURCE_MAP = {
  'lfkj': 'meteofrance_20004002',
  'la_parata': 'meteofrance_20004003',
  'porticcio': 'windsup_porticcio',
  'porticcio_haut': 'wunderground_IGROSS105',
  'mezzavia': 'wunderground_ISARROLA7',
  'propriano': 'wunderground_ICORSEPR2',
  'tizzano': 'wunderground_ISARTN1',
  'bonifacio_tramizzi': 'wunderground_IBONIF6',
  'la_tonnara': 'windsup_tonnara',
  'porto_polo': 'windsup_porto_polo',
  'piantarella': 'windsup_piantarella',
  'santa_manza': 'windsup_santa_manza',
  'balistra': 'windsup_balistra',
  'figari_eole': 'windsup_figari_eole',
  'ajaccio_buoy': 'esurfmar_ajaccio',
  'calvi_buoy': 'esurfmar_calvi',
  'owm-1202': 'pioupiou_1202'
};

const WIND_EDGE_KEYS = Object.values(WIND_SOURCE_MAP);
const MARINE_SOURCES = ['candhis_revellata', 'candhis_bonifacio', 'candhis_alistro', 'esurfmar_ajaccio'];

// Fix 5: deduplicate esurfmar_ajaccio which appears in both lists
const ALL_EDGE_SOURCES = [...new Set([...WIND_EDGE_KEYS, ...MARINE_SOURCES])];

let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function normalizeBackendUrl(url) {
  return url ? url.replace(/\/$/, '') : '';
}

function normalizeBackendApiUrl(url) {
  const backendUrl = normalizeBackendUrl(url);
  if (!backendUrl) return '';
  return backendUrl.endsWith('/api') ? backendUrl : `${backendUrl}/api`;
}

function normalizeBackendSnapshot(snapshot = {}) {
  const windData = snapshot.windData || {};
  const surfData = { ...(snapshot.surfData || {}) };
  let waterData = snapshot.waterData || null;

  const rev = surfData.revellata ? null : windData.candhis_revellata;
  const bon = surfData.bonifacio ? null : windData.candhis_bonifacio;
  const alistro = surfData.alistro ? null : windData.candhis_alistro;
  const ajaccio = surfData.ajaccio ? null : windData.ajaccio_buoy;

  if (rev) {
    surfData.revellata = rev.surf
      ? { ...rev.surf, waterTemp: rev.waterTemp, surfHistory: rev.surfHistory || [] }
      : null;
    waterData = waterData || { current: rev.waterTemp, history: rev.waterHistory || [] };
  }

  if (bon) {
    surfData.bonifacio = bon.surf
      ? { ...bon.surf, waterTemp: bon.waterTemp, surfHistory: bon.surfHistory || [] }
      : null;
  }

  if (alistro) {
    surfData.alistro = alistro.surf
      ? { ...alistro.surf, waterTemp: alistro.waterTemp, surfHistory: alistro.surfHistory || [] }
      : null;
  }

  if (ajaccio) {
    surfData.ajaccio = { ...ajaccio, surfHistory: ajaccio.surfHistory || [] };
  }

  return {
    windData,
    surfData,
    waterData,
  };
}

export function useWeatherData() {
  const [windData, setWindData] = useState({});
  const [surfData, setSurfData] = useState({});
  const [waterData, setWaterData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [error, setError] = useState('');
  const [isRealtime, setIsRealtime] = useState(false);

  const channelRef = useRef(null);
  const realtimeResetRef = useRef(null);

  const markRealtime = useCallback(() => {
    setIsRealtime(true);
    if (realtimeResetRef.current) clearTimeout(realtimeResetRef.current);
    realtimeResetRef.current = setTimeout(() => setIsRealtime(false), 3000);
  }, []);

  const applyBackendSnapshot = useCallback((snapshot, realtime = false) => {
    const normalized = normalizeBackendSnapshot(snapshot);
    setWindData(normalized.windData);
    setSurfData(normalized.surfData);
    setWaterData(normalized.waterData);
    setLastUpdated(snapshot.ts ? new Date(snapshot.ts) : new Date());
    setError('');
    setIsLoading(false);
    if (realtime) markRealtime();
  }, [markRealtime]);

  // Edge Function fetch (full payload with history)
  const fetchFromEdge = useCallback(async (sources) => {
    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
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
    const alistro = data.candhis_alistro;
    const esurf = data.esurfmar_ajaccio;

    if (rev) {
      setWaterData({ current: rev.waterTemp, history: rev.waterHistory || [] });
    }

    setSurfData({
      revellata: rev?.surf ? { ...rev.surf, waterTemp: rev.waterTemp, surfHistory: rev.surfHistory || [] } : null,
      bonifacio: bon?.surf ? { ...bon.surf, waterTemp: bon.waterTemp, surfHistory: bon.surfHistory || [] } : null,
      alistro: alistro?.surf ? { ...alistro.surf, waterTemp: alistro.waterTemp, surfHistory: alistro.surfHistory || [] } : null,
      ajaccio: esurf ? { ...esurf, surfHistory: esurf.surfHistory || [] } : null,
    });
  }, []);

  // Initial fetch + setup Realtime
  useEffect(() => {
    let cancelled = false;
    const backendUrl = normalizeBackendApiUrl(BACKEND_URL);

    if (backendUrl) {
      let eventSource = null;

      const fetchBackendSnapshot = async () => {
        try {
          const res = await fetch(`${backendUrl}/weather`, {
            headers: {
              Accept: 'application/json',
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const snapshot = await res.json();
          if (!cancelled) applyBackendSnapshot(snapshot);
          return snapshot;
        } catch (err) {
          if (!cancelled) {
            setError(`Connexion backend échouée: ${err.message}`);
            setIsLoading(false);
          }
          return null;
        }
      };

      const handleSsePayload = (event, realtime = false) => {
        try {
          const payload = JSON.parse(event.data);
          const snapshot = payload.data || payload;
          if (!cancelled) applyBackendSnapshot(snapshot, realtime);
        } catch (err) {
          if (!cancelled) setError(`Flux temps réel invalide: ${err.message}`);
        }
      };

      const openEventSource = () => {
        if (typeof EventSource === 'undefined') return;

        eventSource = new EventSource(`${backendUrl}/events`);
        eventSource.addEventListener('weather:snapshot', (event) => handleSsePayload(event));
        eventSource.addEventListener('weather:update', (event) => handleSsePayload(event, true));
        eventSource.addEventListener('error', () => {
          eventSource?.close();
          fetchBackendSnapshot();
        });
      };

      fetchBackendSnapshot().then(() => {
        if (!cancelled) openEventSource();
      });

      const backendInterval = setInterval(fetchBackendSnapshot, FALLBACK_POLL_MS);

      return () => {
        cancelled = true;
        clearInterval(backendInterval);
        if (realtimeResetRef.current) clearTimeout(realtimeResetRef.current);
        eventSource?.close();
      };
    }

    // --- 1. Initial full fetch (Fix 5+6: single request, no duplicate esurfmar_ajaccio) ---
    const initialFetch = async () => {
      const raw = await fetchFromEdge(ALL_EDGE_SOURCES);
      if (cancelled) return;
      if (raw) {
        setWindData(mapWindData(raw));
        processMarine(raw);
        setError('');
      }
      setLastUpdated(new Date());
      setIsLoading(false);
    };

    initialFetch();

    // --- 2. Subscribe to Realtime changes on weather_cache ---
    const supabase = getSupabaseClient();
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
            markRealtime();
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
      if (realtimeResetRef.current) clearTimeout(realtimeResetRef.current);
      if (channelRef.current) {
        getSupabaseClient().removeChannel(channelRef.current);
      }
    };
  }, [applyBackendSnapshot, fetchFromEdge, mapWindData, markRealtime, processMarine]);

  return { windData, surfData, waterData, isLoading, lastUpdated, error, isRealtime };
}
