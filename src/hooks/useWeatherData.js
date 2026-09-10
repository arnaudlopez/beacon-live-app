import { useState, useEffect, useRef, useCallback } from 'react';
import { isWeatherSnapshot, loadWeatherSnapshot, saveWeatherSnapshot, recordConnectionEvent } from '../utils/weatherSnapshot';

const BACKEND_URL = import.meta.env.VITE_WEATHER_BACKEND_URL || '/api';
const CACHE_KEY = `beacon_weather_v1:${BACKEND_URL}`;
const FALLBACK_POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

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
  const [cached] = useState(() => loadWeatherSnapshot(CACHE_KEY));
  const [data, setData] = useState(() => normalizeBackendSnapshot(cached || {}));
  const [isLoading, setIsLoading] = useState(!cached);
  const [lastUpdated, setLastUpdated] = useState(() => cached ? new Date(cached.ts) : null);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [isCached, setIsCached] = useState(Boolean(cached));
  const refreshRef = useRef(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let eventSource = null;
    let reconnectTimer = null;
    let retryCount = 0;
    let lastHeartbeat = 0;
    let streamHealthy = false;
    let request = null;
    let acceptedSequence = 0;
    let latestSnapshot = null;
    let lastPoll = 0;
    const backendUrl = normalizeBackendApiUrl(BACKEND_URL);
    const active = () => !disposed && document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const status = (value) => { if (!disposed) setConnectionStatus(value); };

    function accept(snapshot) {
      if (!isWeatherSnapshot(snapshot)) throw new Error('invalid_snapshot');
      if (latestSnapshot) {
        if (snapshot.streamId && snapshot.streamId === latestSnapshot.streamId) {
          if (snapshot.revision < latestSnapshot.revision) return;
        } else if (!snapshot.streamId && Date.parse(snapshot.ts) < Date.parse(latestSnapshot.ts)) return;
      }
      latestSnapshot = snapshot;
      acceptedSequence += 1;
      setData(normalizeBackendSnapshot(snapshot));
      setLastUpdated(new Date(snapshot.ts));
      setError('');
      setIsLoading(false);
      setIsCached(false);
      saveWeatherSnapshot(CACHE_KEY, snapshot);
    }

    function cancelRequest() {
      if (!request) return;
      const previous = request;
      request = null;
      clearTimeout(previous.timeout);
      previous.controller.abort();
    }

    async function fetchSnapshot() {
      if (!active() || request) return;
      const pending = { controller: new AbortController(), sequence: acceptedSequence, startedAt: Date.now() };
      request = pending;
      lastPoll = Date.now();
      recordConnectionEvent('fetch:start');
      const failure = (reason) => {
        if (request !== pending || !active() || pending.sequence !== acceptedSequence) return;
        setIsLoading(false);
        setError('Connexion interrompue. Nouvelle tentative automatique…');
        status('reconnecting');
        recordConnectionEvent('fetch:failed', { reason, durationMs: Date.now() - pending.startedAt });
      };
      pending.timeout = setTimeout(() => {
        failure('timeout');
        if (request === pending) cancelRequest();
      }, REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${backendUrl}/weather`, {
          headers: { Accept: 'application/json' }, cache: 'no-store', signal: pending.controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = await response.json();
        if (request !== pending || !active() || pending.sequence !== acceptedSequence) return;
        accept(snapshot);
        status(streamHealthy ? 'live' : 'polling');
        recordConnectionEvent('fetch:ok', { durationMs: Date.now() - pending.startedAt });
      } catch (err) {
        failure(err.name === 'AbortError' ? 'aborted' : err.message === 'invalid_snapshot' ? 'invalid_snapshot' : /^HTTP \d+$/.test(err.message) ? err.message : 'network');
      } finally {
        clearTimeout(pending.timeout);
        if (request === pending) request = null;
      }
    }

    function closeStream() {
      eventSource?.close();
      eventSource = null;
      streamHealthy = false;
    }

    function retryStream() {
      closeStream();
      if (!active() || reconnectTimer) return;
      status('reconnecting');
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(retryCount++, 5)) + Math.random() * 500;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        openStream();
      }, delay);
      recordConnectionEvent('sse:retry', { delayMs: Math.round(delay) });
      void fetchSnapshot();
    }

    function openStream() {
      if (!active() || eventSource || typeof EventSource === 'undefined') return;
      const stream = new EventSource(`${backendUrl}/events`);
      eventSource = stream;
      lastHeartbeat = Date.now();
      const valid = () => active() && eventSource === stream;
      const healthy = () => {
        lastHeartbeat = Date.now();
        streamHealthy = true;
        retryCount = 0;
        status('live');
      };
      const payload = (event) => {
        if (!valid()) return;
        try {
          const value = JSON.parse(event.data);
          accept(value.data || value);
          healthy();
        } catch {
          recordConnectionEvent('sse:invalid');
          retryStream();
        }
      };
      stream.addEventListener('weather:snapshot', payload);
      stream.addEventListener('weather:update', payload);
      stream.addEventListener('weather:status', payload);
      stream.addEventListener('heartbeat', () => { if (valid()) healthy(); });
      stream.addEventListener('error', () => { if (valid()) retryStream(); });
    }

    function suspend() {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      cancelRequest();
      closeStream();
      status(navigator.onLine === false ? 'offline' : 'paused');
      if (navigator.onLine === false) setIsLoading(false);
      recordConnectionEvent('suspended');
    }

    function resume() {
      if (!active()) { suspend(); return; }
      recordConnectionEvent('resumed');
      openStream();
      void fetchSnapshot();
    }

    // Start both transports independently: a stalled HTTP request must not block SSE.
    resume();
    refreshRef.current = resume;
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('online', resume);
    window.addEventListener('offline', suspend);
    const watchdog = setInterval(() => {
      if (!active()) return;
      if (eventSource && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) retryStream();
      if (!streamHealthy && Date.now() - lastPoll >= FALLBACK_POLL_MS) void fetchSnapshot();
    }, 5000);

    return () => {
      disposed = true;
      clearInterval(watchdog);
      clearTimeout(reconnectTimer);
      cancelRequest();
      closeStream();
      refreshRef.current = () => {};
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', suspend);
    };
  }, []);

  return { ...data, isLoading, lastUpdated, error, isRealtime: connectionStatus === 'live', connectionStatus, isCached, refresh };
}
