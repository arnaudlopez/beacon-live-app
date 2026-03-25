import { useState, useEffect, useRef, useCallback } from 'react';
import { SOURCES, NOTIF_COOLDOWN } from '../config/sources';

const STORAGE_KEY = 'beacon_notification_settings_v2';

const DEFAULT_SETTINGS = { enabled: false, avgEnabled: false, avgThreshold: 10, gustEnabled: true, gustThreshold: 15 };

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  const initial = {};
  SOURCES.forEach(s => { initial[s.id] = { ...DEFAULT_SETTINGS }; });
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
 * Per-spot notifications with independent avg/gust thresholds.
 * Alert fires when ALL enabled conditions are met (AND logic).
 */
export function useNotifications(allWindData) {
  const [settings, setSettings] = useState(loadSettings);
  const lastNotificationTimes = useRef({});
  const previousValues = useRef({});

  useEffect(() => { saveSettings(settings); }, [settings]);

  const update = useCallback((sourceId, patch) => {
    setSettings(prev => ({
      ...prev,
      [sourceId]: { ...(prev[sourceId] || DEFAULT_SETTINGS), ...patch }
    }));
  }, []);

  const toggle = useCallback(async (sourceId, sourceName) => {
    const current = settings[sourceId] || DEFAULT_SETTINGS;
    if (!current.enabled) {
      if (!('Notification' in window)) {
        alert("Ce navigateur ne supporte pas les notifications desktop");
        return;
      }
      if (!current.avgEnabled && !current.gustEnabled) {
        alert("Active au moins un type d'alerte (Moy ou Raf) avant d'activer !");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        update(sourceId, { enabled: true });
        const parts = [];
        if (current.avgEnabled) parts.push(`moy ≥ ${current.avgThreshold} kts`);
        if (current.gustEnabled) parts.push(`raf ≥ ${current.gustThreshold} kts`);
        sendNotification('Alertes Activées 🌬️', {
          body: `${sourceName} — ${parts.join(' ET ')}`,
          icon: '/favicon.svg'
        });
      } else {
        alert('Veuillez autoriser les notifications dans les paramètres de votre navigateur.');
      }
    } else {
      update(sourceId, { enabled: false });
    }
  }, [settings, update]);

  // Monitor threshold crossings
  useEffect(() => {
    if (!allWindData || Object.keys(allWindData).length === 0) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const now = Date.now();
    SOURCES.forEach(source => {
      const s = settings[source.id];
      if (!s || !s.enabled) return;
      if (!s.avgEnabled && !s.gustEnabled) return;

      const windInfo = allWindData[source.id];
      if (!windInfo || !windInfo.live) return;

      const gust = parseFloat(windInfo.live.windGust);
      const avg = parseFloat(windInfo.live.windSpeed);
      const prev = previousValues.current[source.id] || {};
      previousValues.current[source.id] = { gust, avg };

      // Check ALL enabled conditions (AND logic)
      let allMet = true;
      let anyJustCrossed = false;
      const parts = [];

      if (s.gustEnabled) {
        if (isNaN(gust) || gust < s.gustThreshold) { allMet = false; }
        else {
          parts.push(`raf: ${gust} kts`);
          if (prev.gust === undefined || prev.gust < s.gustThreshold) anyJustCrossed = true;
        }
      }
      if (s.avgEnabled) {
        if (isNaN(avg) || avg < s.avgThreshold) { allMet = false; }
        else {
          parts.push(`moy: ${avg} kts`);
          if (prev.avg === undefined || prev.avg < s.avgThreshold) anyJustCrossed = true;
        }
      }

      if (!allMet) return;

      const lastTime = lastNotificationTimes.current[source.id] || 0;
      const cooldownExpired = (now - lastTime) >= NOTIF_COOLDOWN;
      if (!anyJustCrossed && !cooldownExpired) return;

      sendNotification(`⚠️ Alerte ${source.name}`, {
        body: parts.join(' · '),
        icon: '/favicon.svg',
        tag: `alert-${source.id}`
      });
      lastNotificationTimes.current[source.id] = now;
    });
  }, [allWindData, settings]);

  return { settings, update, toggle, DEFAULT_SETTINGS };
}
