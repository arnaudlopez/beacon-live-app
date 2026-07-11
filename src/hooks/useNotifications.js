import { useState, useEffect, useRef, useCallback } from 'react';
import { SOURCES, NOTIF_COOLDOWN } from '../config/sources';

const STORAGE_KEY = 'beacon_notification_settings_v2';
const BACKEND_URL = (import.meta.env.VITE_WEATHER_BACKEND_URL || '/api').replace(/\/$/, '');
const API_URL = BACKEND_URL.endsWith('/api') ? BACKEND_URL : `${BACKEND_URL}/api`;

const DEFAULT_SETTINGS = { enabled: false, avgEnabled: false, avgThreshold: 10, gustEnabled: true, gustThreshold: 15 };

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* storage may be unavailable */ }
  return Object.fromEntries(SOURCES.map((source) => [source.id, { ...DEFAULT_SETTINGS }]));
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* storage may be unavailable */ }
}

function alertsForServer(settings) {
  return Object.fromEntries(SOURCES.map((source) => [source.id, {
    ...(settings[source.id] || DEFAULT_SETTINGS),
    sourceName: source.name,
  }]));
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function getPushConfig() {
  const response = await fetch(`${API_URL}/push/public-key`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function savePushSubscription(subscription, settings) {
  const response = await fetch(`${API_URL}/push/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), alerts: alertsForServer(settings) }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function removePushSubscription(subscription) {
  const response = await fetch(`${API_URL}/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await subscription.unsubscribe();
}

async function showNotification(title, options) {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration?.active) return registration.showNotification(title, options);
  return new window.Notification(title, options);
}

/**
 * Notifications are delivered by Web Push when VAPID is configured. The local
 * threshold monitor remains as a deployment fallback for unconfigured servers.
 */
export function useNotifications(allWindData) {
  const [settings, setSettings] = useState(loadSettings);
  const [pushConfigured, setPushConfigured] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const lastNotificationTimes = useRef({});
  const previousValues = useRef({});
  const checkTimerRef = useRef(null);

  useEffect(() => { saveSettings(settings); }, [settings]);

  useEffect(() => {
    let cancelled = false;
    getPushConfig()
      .then(async (config) => {
        const supported = Boolean(config.configured && config.publicKey && 'serviceWorker' in navigator && 'PushManager' in window);
        if (!cancelled) setPushConfigured(supported);
        if (!supported || Notification.permission !== 'granted') return;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await savePushSubscription(subscription, settings);
          if (!cancelled) setPushSubscribed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPushConfigured(false);
      });
    return () => { cancelled = true; };
    // Reconcile the persisted subscription once on startup. User edits are locked while enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((sourceId, patch) => {
    setSettings((previous) => ({
      ...previous,
      [sourceId]: { ...(previous[sourceId] || DEFAULT_SETTINGS), ...patch },
    }));
  }, []);

  const toggle = useCallback(async (sourceId, sourceName) => {
    const current = settings[sourceId] || DEFAULT_SETTINGS;
    setDeliveryError('');

    if (!current.enabled) {
      if (!('Notification' in window)) {
        alert("Ce navigateur ne supporte pas les notifications. Sur iPhone/iPad, ajoute d'abord la PWA à l'écran d'accueil.");
        return;
      }
      if (!current.avgEnabled && !current.gustEnabled) {
        alert("Active au moins un type d'alerte (Moy ou Raf) avant d'activer !");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Veuillez autoriser les notifications dans les paramètres de votre navigateur.');
        return;
      }

      const nextSettings = {
        ...settings,
        [sourceId]: { ...current, enabled: true },
      };
      try {
        let config = null;
        let usePush = pushConfigured;
        if (usePush === null) {
          config = await getPushConfig();
          usePush = Boolean(config.configured && config.publicKey && 'serviceWorker' in navigator && 'PushManager' in window);
          setPushConfigured(usePush);
        }
        if (usePush) {
          config ||= await getPushConfig();
          const registration = await navigator.serviceWorker.ready;
          let subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(config.publicKey),
            });
          }
          await savePushSubscription(subscription, nextSettings);
          setPushSubscribed(true);
        }
        delete previousValues.current[sourceId];
        delete lastNotificationTimes.current[sourceId];
        setSettings(nextSettings);
        const parts = [];
        if (current.avgEnabled) parts.push(`moy ≥ ${current.avgThreshold} kts`);
        if (current.gustEnabled) parts.push(`raf ≥ ${current.gustThreshold} kts`);
        await showNotification('Alertes activées 🌬️', {
          body: `${sourceName} — ${parts.join(' ET ')}${usePush ? ' · actives même app fermée' : ''}`,
          icon: '/icon-192.png',
        });
      } catch (error) {
        setDeliveryError("L'abonnement Push a échoué. Réessaie après avoir vérifié la connexion.");
        console.error('Push subscription failed', error);
      }
      return;
    }

    const nextSettings = {
      ...settings,
      [sourceId]: { ...current, enabled: false },
    };
    try {
      if (pushConfigured) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const anyEnabled = Object.values(nextSettings).some((value) => value.enabled);
          if (anyEnabled) await savePushSubscription(subscription, nextSettings);
          else {
            await removePushSubscription(subscription);
            setPushSubscribed(false);
          }
        }
      }
      setSettings(nextSettings);
    } catch (error) {
      setDeliveryError("Impossible de désactiver l'alerte sur le serveur. Réessaie dans un instant.");
      console.error('Push unsubscription failed', error);
    }
  }, [pushConfigured, settings]);

  useEffect(() => {
    if (pushSubscribed || !allWindData || Object.keys(allWindData).length === 0) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => {
      const now = Date.now();
      SOURCES.forEach((source) => {
        const alert = settings[source.id];
        if (!alert?.enabled || (!alert.avgEnabled && !alert.gustEnabled)) return;
        const live = allWindData[source.id]?.live;
        if (!live) return;
        const gust = Number.parseFloat(live.windGust);
        const avg = Number.parseFloat(live.windSpeed);
        const previous = previousValues.current[source.id] || {};
        previousValues.current[source.id] = { gust, avg };
        let met = true;
        let crossed = false;
        const parts = [];
        if (alert.gustEnabled) {
          if (!Number.isFinite(gust) || gust < alert.gustThreshold) met = false;
          else {
            parts.push(`raf: ${gust} kts`);
            if (previous.gust === undefined || previous.gust < alert.gustThreshold) crossed = true;
          }
        }
        if (alert.avgEnabled) {
          if (!Number.isFinite(avg) || avg < alert.avgThreshold) met = false;
          else {
            parts.push(`moy: ${avg} kts`);
            if (previous.avg === undefined || previous.avg < alert.avgThreshold) crossed = true;
          }
        }
        const lastTime = lastNotificationTimes.current[source.id] || 0;
        if (!met || (!crossed && now - lastTime < NOTIF_COOLDOWN)) return;
        showNotification(`⚠️ Alerte ${source.name}`, {
          body: parts.join(' · '), icon: '/icon-192.png', tag: `alert-${source.id}`,
        });
        lastNotificationTimes.current[source.id] = now;
      });
    }, 500);
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); };
  }, [allWindData, pushSubscribed, settings]);

  return { settings, update, toggle, pushConfigured, pushSubscribed, deliveryError, DEFAULT_SETTINGS };
}
