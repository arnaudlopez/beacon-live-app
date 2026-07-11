const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteThreshold(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null;
}

function normalizeAlerts(alerts) {
  if (!alerts || typeof alerts !== 'object' || Array.isArray(alerts)) return {};
  const normalized = {};
  for (const [sourceId, value] of Object.entries(alerts)) {
    if (!value?.enabled || typeof sourceId !== 'string' || sourceId.length > 100) continue;
    const avgThreshold = finiteThreshold(value.avgThreshold);
    const gustThreshold = finiteThreshold(value.gustThreshold);
    const avgEnabled = Boolean(value.avgEnabled && avgThreshold !== null);
    const gustEnabled = Boolean(value.gustEnabled && gustThreshold !== null);
    if (!avgEnabled && !gustEnabled) continue;
    normalized[sourceId] = {
      enabled: true,
      avgEnabled,
      avgThreshold: avgThreshold ?? 10,
      gustEnabled,
      gustThreshold: gustThreshold ?? 15,
      sourceName: typeof value.sourceName === 'string'
        ? value.sourceName.slice(0, 120)
        : sourceId,
    };
  }
  return normalized;
}

function normalizeSubscription(subscription) {
  if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 4096 || !subscription.endpoint.startsWith('https://')) {
    throw new Error('invalid_push_subscription');
  }
  if (typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') {
    throw new Error('invalid_push_subscription_keys');
  }
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };
}

function conditionsFor(alert, windInfo, previous) {
  if (!windInfo?.live) return { met: false, crossed: false, parts: [], values: null };
  const gust = Number.parseFloat(windInfo.live.windGust);
  const avg = Number.parseFloat(windInfo.live.windSpeed);
  const values = { gust, avg };
  let met = true;
  let crossed = false;
  const parts = [];

  if (alert.gustEnabled) {
    if (!Number.isFinite(gust) || gust < alert.gustThreshold) met = false;
    else {
      parts.push(`raf: ${gust} kts`);
      if (previous?.gust === undefined || previous.gust < alert.gustThreshold) crossed = true;
    }
  }
  if (alert.avgEnabled) {
    if (!Number.isFinite(avg) || avg < alert.avgThreshold) met = false;
    else {
      parts.push(`moy: ${avg} kts`);
      if (previous?.avg === undefined || previous.avg < alert.avgThreshold) crossed = true;
    }
  }
  return { met, crossed, parts, values };
}

export async function createPushNotificationService({
  store,
  sender,
  publicKey = '',
  clock = { now: () => Date.now() },
  cooldownMs = DEFAULT_COOLDOWN_MS,
  logger = globalThis.console,
}) {
  if (!store?.loadState || !store?.saveState) throw new Error('push service requires a store');
  const loaded = await store.loadState();
  let subscriptions = Array.isArray(loaded.subscriptions) ? loaded.subscriptions : [];
  let writeQueue = Promise.resolve();

  function isConfigured() {
    return Boolean(publicKey && sender?.sendNotification);
  }

  function persist() {
    writeQueue = writeQueue
      .catch(() => {})
      .then(() => store.saveState({ subscriptions: clone(subscriptions) }));
    return writeQueue;
  }

  async function upsert({ subscription, alerts }) {
    if (!isConfigured()) throw new Error('push_not_configured');
    const normalizedSubscription = normalizeSubscription(subscription);
    const normalizedAlerts = normalizeAlerts(alerts);
    const index = subscriptions.findIndex((item) => item.subscription?.endpoint === normalizedSubscription.endpoint);
    const previous = index >= 0 ? subscriptions[index] : null;
    const previousValues = previous?.previousValues ?? {};
    const lastNotificationTimes = previous?.lastNotificationTimes ?? {};
    for (const [sourceId, alert] of Object.entries(normalizedAlerts)) {
      const oldAlert = previous?.alerts?.[sourceId];
      const changed = !oldAlert
        || oldAlert.avgEnabled !== alert.avgEnabled
        || oldAlert.avgThreshold !== alert.avgThreshold
        || oldAlert.gustEnabled !== alert.gustEnabled
        || oldAlert.gustThreshold !== alert.gustThreshold;
      if (changed) {
        delete previousValues[sourceId];
        delete lastNotificationTimes[sourceId];
      }
    }
    const record = {
      subscription: normalizedSubscription,
      alerts: normalizedAlerts,
      previousValues,
      lastNotificationTimes,
      updatedAt: new Date(clock.now()).toISOString(),
    };
    if (index >= 0) subscriptions[index] = record;
    else subscriptions.push(record);
    await persist();
    return { alertCount: Object.keys(normalizedAlerts).length };
  }

  async function remove(endpoint) {
    const before = subscriptions.length;
    subscriptions = subscriptions.filter((item) => item.subscription?.endpoint !== endpoint);
    if (subscriptions.length !== before) await persist();
    return { removed: subscriptions.length !== before };
  }

  async function handleSnapshot(snapshot) {
    if (!isConfigured() || !snapshot?.windData) return { sent: 0, removed: 0 };
    const now = clock.now();
    let sent = 0;
    let removed = 0;
    let changed = false;

    for (const record of [...subscriptions]) {
      let expired = false;
      for (const [sourceId, alert] of Object.entries(record.alerts ?? {})) {
        const result = conditionsFor(alert, snapshot.windData[sourceId], record.previousValues?.[sourceId]);
        if (result.values) {
          record.previousValues ??= {};
          record.previousValues[sourceId] = result.values;
          changed = true;
        }
        if (!result.met) continue;
        const lastTime = record.lastNotificationTimes?.[sourceId] ?? 0;
        if (!result.crossed && now - lastTime < cooldownMs) continue;

        const payload = JSON.stringify({
          title: `⚠️ Alerte ${alert.sourceName}`,
          body: result.parts.join(' · '),
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `alert-${sourceId}`,
          url: `/?source=${encodeURIComponent(sourceId)}`,
        });
        try {
          await sender.sendNotification(record.subscription, payload, { TTL: 120 });
          record.lastNotificationTimes ??= {};
          record.lastNotificationTimes[sourceId] = now;
          sent += 1;
          changed = true;
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            expired = true;
            break;
          }
          logger?.error?.(`Web Push failed for ${sourceId}: ${error?.message ?? error}`);
        }
      }
      if (expired) {
        subscriptions = subscriptions.filter((item) => item !== record);
        removed += 1;
        changed = true;
      }
    }

    if (changed) await persist();
    return { sent, removed };
  }

  return {
    isConfigured,
    getPublicKey: () => publicKey,
    upsert,
    remove,
    handleSnapshot,
    getSubscriptionCount: () => subscriptions.length,
  };
}
