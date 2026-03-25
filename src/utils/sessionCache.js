/**
 * Lightweight sessionStorage cache with TTL support.
 * Replaces the 5× duplicated pattern in Dashboard.
 */

const DEFAULT_TTL = 55000; // 55 seconds

export function getCached(key, ttlMs = DEFAULT_TTL) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { timestamp, data } = JSON.parse(raw);
    if (Date.now() - timestamp < ttlMs) return data;
  } catch (e) {
    console.warn(`Cache read error for "${key}"`, e);
  }
  return null;
}

export function setCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (e) {
    console.warn(`Cache write error for "${key}"`, e);
  }
}
