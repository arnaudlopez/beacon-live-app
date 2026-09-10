const MAX_CACHE_AGE_MS = 48 * 60 * 60 * 1000;

export function isWeatherSnapshot(value) {
  return Boolean(value && typeof value === 'object'
    && Number.isFinite(Date.parse(value.ts))
    && value.windData && typeof value.windData === 'object' && !Array.isArray(value.windData)
    && (!value.surfData || (typeof value.surfData === 'object' && !Array.isArray(value.surfData))));
}

export function loadWeatherSnapshot(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    const age = Date.now() - cached?.savedAt;
    if (age >= 0 && age < MAX_CACHE_AGE_MS && isWeatherSnapshot(cached.snapshot)) return cached.snapshot;
  } catch { /* Offline storage is optional. */ }
  return null;
}

export function saveWeatherSnapshot(key, snapshot) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), snapshot }));
  } catch { /* Quota or private mode must not break live data. */ }
}

// Local, bounded diagnostics; no station values, subscription URLs or secrets.
export function recordConnectionEvent(type, details = {}) {
  try {
    const key = 'beacon_connection_diagnostics_v1';
    const previous = JSON.parse(sessionStorage.getItem(key) || '[]');
    const events = Array.isArray(previous) ? previous.slice(-49) : [];
    events.push({ at: new Date().toISOString(), type, visible: document.visibilityState, online: navigator.onLine, ...details });
    sessionStorage.setItem(key, JSON.stringify(events));
  } catch { /* Diagnostics must never affect networking. */ }
}
