import { useState, useEffect, useRef, useCallback } from 'react';
import { isAlertObservationFresh } from '../../shared/weatherFreshness';
import { fetchWithTimeout, withTimeout } from '../utils/network';
import { SOURCES, NOTIF_COOLDOWN } from '../config/sources';

const STORAGE_KEY = 'beacon_notification_settings_v2';
const BACKEND_URL = (import.meta.env.VITE_WEATHER_BACKEND_URL || '/api').replace(/\/$/, '');
const API_URL = BACKEND_URL.endsWith('/api') ? BACKEND_URL : `${BACKEND_URL}/api`;

const DEFAULT_SETTINGS = { enabled: false, avgEnabled: false, avgThreshold: 10, gustEnabled: true, gustThreshold: 15 };

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return Object.fromEntries(SOURCES.map(source => [source.id, { ...DEFAULT_SETTINGS, ...parsed?.[source.id] }]));
    }
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

function getPushConfig() {
  return fetchWithTimeout(`${API_URL}/push/public-key`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
}

function supportsPush(config) {
  return Boolean(config.configured && config.publicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

function savePushSubscription(subscription, settings) {
  return fetchWithTimeout(`${API_URL}/push/subscriptions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), alerts: alertsForServer(settings) }),
  });
}

async function removePushSubscription(subscription) {
  await fetchWithTimeout(`${API_URL}/push/subscriptions`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await withTimeout(subscription.unsubscribe());
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
  const [isBusy, setIsBusy] = useState(false);
  const reconcileRef = useRef(() => {});
  const busyRef = useRef(false);
  const settingsRef = useRef(settings);
  const lastNotificationTimes = useRef({});
  const previousValues = useRef({});
  const checkTimerRef = useRef(null);

  useEffect(() => { settingsRef.current = settings; saveSettings(settings); }, [settings]);

  useEffect(() => {
    let cancelled = false;
    async function reconcile() {
      if (cancelled || busyRef.current || navigator.onLine === false || document.visibilityState === 'hidden') return;
      busyRef.current = true;
      setIsBusy(true);
      try {
        const config = await getPushConfig();
        if (cancelled) return;
        const supported = supportsPush(config);
        let subscribed = false;
        if (supported && Notification.permission === 'granted') {
          const registration = await withTimeout(navigator.serviceWorker.ready);
          const subscription = await withTimeout(registration.pushManager.getSubscription());
          if (cancelled) return;
          const anyEnabled = Object.values(settingsRef.current).some(value => value.enabled);
          if (subscription) {
            if (anyEnabled) {
              await savePushSubscription(subscription, settingsRef.current);
              subscribed = true;
            } else await removePushSubscription(subscription);
          }
          if (!subscribed && anyEnabled) {
            setDeliveryError("Alertes à réactiver : désactive puis réactive une alerte pour confirmer l'abonnement de cet appareil.");
          } else setDeliveryError('');
        }
        if (!cancelled) {
          setPushConfigured(supported);
          setPushSubscribed(subscribed);
          if (!supported) setDeliveryError('');
        }
      } catch {
        if (!cancelled) {
          setPushConfigured(null);
          // Background reconciliation stays silent; action failures remain visible.
        }
      } finally {
        busyRef.current = false;
        if (!cancelled) setIsBusy(false);
        else queueMicrotask(() => reconcileRef.current());
      }
    }
    reconcileRef.current = reconcile;
    void reconcile();
    const timer = setInterval(reconcile, 60_000);
    window.addEventListener('online', reconcile);
    window.addEventListener('pageshow', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      cancelled = true;
      if (reconcileRef.current === reconcile) reconcileRef.current = () => {};
      clearInterval(timer);
      window.removeEventListener('online', reconcile);
      window.removeEventListener('pageshow', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, []);

  const update = useCallback((sourceId, patch) => {
    setSettings((previous) => ({
      ...previous,
      [sourceId]: { ...(previous[sourceId] || DEFAULT_SETTINGS), ...patch },
    }));
  }, []);

  const toggle = useCallback(async (sourceId, sourceName) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setDeliveryError('');
    const currentSettings = settingsRef.current;
    const current = currentSettings[sourceId] || DEFAULT_SETTINGS;
    try {
      if (!current.enabled) {
        if (!('Notification' in window)) throw new Error('unsupported');
        if ((!current.avgEnabled && !current.gustEnabled)
          || (current.avgEnabled && (!Number.isFinite(current.avgThreshold) || current.avgThreshold < 1 || current.avgThreshold > 100))
          || (current.gustEnabled && (!Number.isFinite(current.gustThreshold) || current.gustThreshold < 1 || current.gustThreshold > 100))) {
          setDeliveryError('Choisis au moins un seuil entre 1 et 100 nœuds.');
          return;
        }
        // Keep the permission request directly in the user gesture for Safari.
        if (await Notification.requestPermission() !== 'granted') {
          setDeliveryError('Autorise les notifications dans les paramètres du navigateur pour activer les alertes.');
          return;
        }
        const config = await getPushConfig();
        const usePush = supportsPush(config);
        const next = { ...currentSettings, [sourceId]: { ...current, enabled: true } };
        if (usePush) {
          const registration = await withTimeout(navigator.serviceWorker.ready);
          let subscription = await withTimeout(registration.pushManager.getSubscription());
          if (!subscription) subscription = await withTimeout(registration.pushManager.subscribe({
            userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey),
          }));
          await savePushSubscription(subscription, next);
          setPushSubscribed(true);
        }
        setPushConfigured(usePush);
        setPushSubscribed(usePush);
        settingsRef.current = next;
        setSettings(next);
        delete previousValues.current[sourceId];
        delete lastNotificationTimes.current[sourceId];
        // Confirmation failure must not imply that a successful subscription failed.
        void showNotification('Alertes activées 🌬️', {
          body: `${sourceName} · ${usePush ? 'actives même app fermée' : "uniquement lorsque l’application est ouverte"}`,
          icon: '/icon-192.png',
        }).catch(() => {});
      } else {
        const next = { ...currentSettings, [sourceId]: { ...current, enabled: false } };
        // Always check the device subscription, even if config lookup previously failed.
        const registration = navigator.serviceWorker
          ? await withTimeout(navigator.serviceWorker.getRegistration()) : null;
        const subscription = registration?.pushManager
          ? await withTimeout(registration.pushManager.getSubscription()) : null;
        if (subscription) {
          if (Object.values(next).some(value => value.enabled)) await savePushSubscription(subscription, next);
          else {
            await removePushSubscription(subscription);
            setPushSubscribed(false);
          }
        }
        settingsRef.current = next;
        setSettings(next);
      }
    } catch (err) {
      setDeliveryError(err.message === 'unsupported'
        ? "Ce navigateur ne permet pas les notifications. Sur iPhone/iPad, installe l’application sur l’écran d’accueil."
        : current.enabled
          ? "Désactivation non confirmée. L’alerte reste active ; réessaie avec une connexion."
          : "Activation non confirmée. Vérifie la connexion puis réessaie.");
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (pushConfigured !== false || isBusy || pushSubscribed || !allWindData || Object.keys(allWindData).length === 0) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => {
      const now = Date.now();
      SOURCES.forEach((source) => {
        const alert = settings[source.id];
        if (!alert?.enabled || (!alert.avgEnabled && !alert.gustEnabled)) return;
        const live = allWindData[source.id]?.live;
        if (!isAlertObservationFresh(allWindData[source.id], now)) return;
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
        }).catch(() => {});
        lastNotificationTimes.current[source.id] = now;
      });
    }, 500);
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); };
  }, [allWindData, pushSubscribed, pushConfigured, isBusy, settings]);

  return { settings, update, toggle, isBusy, pushConfigured, pushSubscribed, deliveryError, DEFAULT_SETTINGS };
}
