import { useState, useEffect, useRef, useCallback } from 'react';
import { SOURCES, NOTIF_COOLDOWN, DEFAULT_NOTIFICATION_THRESHOLD } from '../config/sources';

const STORAGE_KEY = 'beacon_notification_settings';

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: add alertMode if missing from older settings
      Object.keys(parsed).forEach(id => {
        if (!parsed[id].alertMode) parsed[id].alertMode = 'gust';
      });
      return parsed;
    }
  } catch { /* ignore */ }
  const initial = {};
  SOURCES.forEach(s => { initial[s.id] = { enabled: false, threshold: DEFAULT_NOTIFICATION_THRESHOLD, alertMode: 'gust' }; });
  return initial;
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

function sendNotification(title, options) {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.active) {
          reg.showNotification(title, options);
        } else {
          new window.Notification(title, options);
        }
      }).catch(() => new window.Notification(title, options));
    } else {
      new window.Notification(title, options);
    }
  } catch(e) { /* fallback */ }
}

/**
 * Manages per-spot notification settings, permissions, and alert dispatching.
 * alertMode: 'gust' | 'avg' | 'both'
 */
export function useNotifications(allWindData) {
  const [settings, setSettings] = useState(loadSettings);
  const lastNotificationTimes = useRef({});
  const previousValues = useRef({});

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setThreshold = useCallback((sourceId, value) => {
    setSettings(prev => ({
      ...prev,
      [sourceId]: { ...prev[sourceId], threshold: Number(value) }
    }));
  }, []);

  const setAlertMode = useCallback((sourceId, mode) => {
    setSettings(prev => ({
      ...prev,
      [sourceId]: { ...prev[sourceId], alertMode: mode }
    }));
  }, []);

  const toggle = useCallback(async (sourceId, sourceName) => {
    const current = settings[sourceId];
    if (!current.enabled) {
      if (!('Notification' in window)) {
        alert("Ce navigateur ne supporte pas les notifications desktop");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setSettings(prev => ({
          ...prev,
          [sourceId]: { ...prev[sourceId], enabled: true }
        }));

        const modeLabel = { gust: 'rafales', avg: 'vent moyen', both: 'moy. + rafales' }[current.alertMode || 'gust'];
        const msg = `Alertes activées pour ${sourceName} — seuil ${current.threshold} kts (${modeLabel}).`;
        sendNotification('Alertes Activées 🌬️', { body: msg, icon: '/favicon.svg' });
      } else {
        alert('Veuillez autoriser les notifications dans les paramètres de votre navigateur.');
      }
    } else {
      setSettings(prev => ({
        ...prev,
        [sourceId]: { ...prev[sourceId], enabled: false }
      }));
    }
  }, [settings]);

  // Monitor all enabled spots for threshold crossing
  useEffect(() => {
    if (!allWindData || Object.keys(allWindData).length === 0) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const now = Date.now();
    SOURCES.forEach(source => {
      const s = settings[source.id];
      if (!s || !s.enabled) return;

      const windInfo = allWindData[source.id];
      if (!windInfo || !windInfo.live) return;

      const gust = parseFloat(windInfo.live.windGust);
      const avg = parseFloat(windInfo.live.windSpeed);
      const mode = s.alertMode || 'gust';
      const prevKey = source.id;
      const prev = previousValues.current[prevKey] || {};

      // Update previous values
      previousValues.current[prevKey] = { gust, avg };

      // Check which metrics should be evaluated based on alertMode
      const checks = [];
      if (mode === 'gust' || mode === 'both') {
        if (!isNaN(gust) && gust >= s.threshold) {
          const justCrossed = prev.gust === undefined || prev.gust < s.threshold;
          checks.push({ type: 'rafale', value: gust, justCrossed });
        }
      }
      if (mode === 'avg' || mode === 'both') {
        if (!isNaN(avg) && avg >= s.threshold) {
          const justCrossed = prev.avg === undefined || prev.avg < s.threshold;
          checks.push({ type: 'vent moyen', value: avg, justCrossed });
        }
      }

      if (checks.length === 0) return;

      // Check if any metric just crossed OR cooldown expired
      const anyJustCrossed = checks.some(c => c.justCrossed);
      const lastTime = lastNotificationTimes.current[source.id] || 0;
      const cooldownExpired = (now - lastTime) >= NOTIF_COOLDOWN;

      if (!anyJustCrossed && !cooldownExpired) return;

      // Build notification message
      const triggered = checks.map(c => `${c.type}: ${c.value} kts`).join(' · ');
      const title = `⚠️ Alerte ${source.name}`;
      const options = {
        body: `${triggered} (seuil: ${s.threshold} kts)`,
        icon: '/favicon.svg',
        tag: `alert-${source.id}`
      };

      sendNotification(title, options);
      lastNotificationTimes.current[source.id] = now;
    });
  }, [allWindData, settings]);

  return { settings, setThreshold, setAlertMode, toggle };
}
