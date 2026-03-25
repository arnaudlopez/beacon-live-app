import { useState, useEffect, useRef, useCallback } from 'react';
import { SOURCES, NOTIF_COOLDOWN, DEFAULT_NOTIFICATION_THRESHOLD } from '../config/sources';

const STORAGE_KEY = 'beacon_notification_settings';

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  const initial = {};
  SOURCES.forEach(s => { initial[s.id] = { enabled: false, threshold: DEFAULT_NOTIFICATION_THRESHOLD }; });
  return initial;
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/**
 * Manages per-spot notification settings, permissions, and alert dispatching.
 * Settings are persisted in localStorage.
 */
export function useNotifications(allWindData) {
  const [settings, setSettings] = useState(loadSettings);
  const lastNotificationTimes = useRef({});

  // Persist whenever settings change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setThreshold = useCallback((sourceId, value) => {
    setSettings(prev => ({
      ...prev,
      [sourceId]: { ...prev[sourceId], threshold: Number(value) }
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

        const msg = `Alertes activées pour ${sourceName} — seuil ${current.threshold} kts.`;
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification('Alertes Activées 🌬️', { body: msg, icon: '/favicon.svg' });
          }).catch(() => new window.Notification('Alertes Activées 🌬️', { body: msg }));
        } else {
          new window.Notification('Alertes Activées 🌬️', { body: msg });
        }
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
      if (isNaN(gust) || gust < s.threshold) return;

      const lastTime = lastNotificationTimes.current[source.id] || 0;
      if (now - lastTime < NOTIF_COOLDOWN) return;

      const title = `⚠️ Alerte ${source.name}`;
      const options = {
        body: `Rafale à ${windInfo.live.windGust} kts (seuil: ${s.threshold} kts)`,
        icon: '/favicon.svg',
        tag: `alert-${source.id}`
      };

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, options);
        }).catch(() => new window.Notification(title, options));
      } else {
        new window.Notification(title, options);
      }
      lastNotificationTimes.current[source.id] = now;
    });
  }, [allWindData, settings]);

  return { settings, setThreshold, toggle };
}
