import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * @typedef {import('../types').AllWindData} AllWindData
 * @typedef {import('../types').AllSurfData} AllSurfData
 * @typedef {import('../types').WaterData} WaterData
 */

/**
 * Weather data hook backed by the local realtime weather API.
 * 
 * Flow:
 * 1. On mount: fetch a full snapshot from /api/weather
 * 2. Subscribe to /api/events for SSE updates
 * 3. On weather:update: merge the new snapshot into state
 * 4. Fallback: poll every 60s in case SSE drops
 * 
 * Returns: { windData, surfData, waterData, isLoading, lastUpdated, error, isRealtime }
 */

const BACKEND_URL = import.meta.env.VITE_WEATHER_BACKEND_URL || '/api';

// Fallback polling interval (only used if SSE is down)
const FALLBACK_POLL_MS = 60_000;

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

  // Initial fetch + setup SSE
  useEffect(() => {
    let cancelled = false;
    const backendUrl = normalizeBackendApiUrl(BACKEND_URL);
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
  }, [applyBackendSnapshot]);

  return { windData, surfData, waterData, isLoading, lastUpdated, error, isRealtime };
}
