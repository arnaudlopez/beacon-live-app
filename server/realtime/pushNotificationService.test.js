import { describe, expect, it, vi } from 'vitest';
import { createPushNotificationService } from './pushNotificationService.js';

function createMemoryStore(initial = { subscriptions: [] }) {
  let state = structuredClone(initial);
  return {
    loadState: vi.fn(async () => structuredClone(state)),
    saveState: vi.fn(async (next) => { state = structuredClone(next); }),
    getState: () => structuredClone(state),
  };
}

function pushSubscription(endpoint = 'https://push.example.test/device-1') {
  return {
    endpoint,
    expirationTime: null,
    keys: { p256dh: 'public-device-key', auth: 'auth-secret' },
  };
}

function snapshot(avg, gust) {
  return { windData: { porticcio: { live: { windSpeed: avg, windGust: gust } } } };
}

describe('server-side Web Push alerts', () => {
  it('persists settings and sends on a crossing or after the cooldown', async () => {
    let now = 1_000_000;
    const store = createMemoryStore();
    const sender = { sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }) };
    const service = await createPushNotificationService({
      store,
      sender,
      publicKey: 'vapid-public',
      clock: { now: () => now },
      cooldownMs: 900_000,
    });

    await service.upsert({
      subscription: pushSubscription(),
      alerts: {
        porticcio: {
          enabled: true,
          avgEnabled: true,
          avgThreshold: 12,
          gustEnabled: true,
          gustThreshold: 18,
          sourceName: 'Porticcio',
        },
      },
    });

    await service.handleSnapshot(snapshot(13, 19));
    await service.handleSnapshot(snapshot(14, 20));
    expect(sender.sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sender.sendNotification.mock.calls[0][1])).toMatchObject({
      title: '⚠️ Alerte Porticcio',
      body: 'raf: 19 kts · moy: 13 kts',
      tag: 'alert-porticcio',
    });

    now += 900_000;
    await service.handleSnapshot(snapshot(14, 20));
    expect(sender.sendNotification).toHaveBeenCalledTimes(2);
    expect(store.getState().subscriptions[0].lastNotificationTimes.porticcio).toBe(now);
  });

  it('requires all enabled conditions and sends again after a new crossing', async () => {
    const store = createMemoryStore();
    const sender = { sendNotification: vi.fn().mockResolvedValue({}) };
    const service = await createPushNotificationService({ store, sender, publicKey: 'key' });
    await service.upsert({
      subscription: pushSubscription(),
      alerts: {
        porticcio: { enabled: true, avgEnabled: true, avgThreshold: 12, gustEnabled: true, gustThreshold: 18 },
      },
    });

    await service.handleSnapshot(snapshot(10, 20));
    await service.handleSnapshot(snapshot(13, 20));
    await service.handleSnapshot(snapshot(10, 10));
    await service.handleSnapshot(snapshot(13, 20));
    expect(sender.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('removes expired browser subscriptions', async () => {
    const store = createMemoryStore();
    const error = Object.assign(new Error('gone'), { statusCode: 410 });
    const sender = { sendNotification: vi.fn().mockRejectedValue(error) };
    const service = await createPushNotificationService({ store, sender, publicKey: 'key' });
    await service.upsert({
      subscription: pushSubscription(),
      alerts: { porticcio: { enabled: true, gustEnabled: true, gustThreshold: 18 } },
    });

    await expect(service.handleSnapshot(snapshot(13, 20))).resolves.toEqual({ sent: 0, removed: 1 });
    expect(service.getSubscriptionCount()).toBe(0);
    expect(store.getState().subscriptions).toEqual([]);
  });
});
