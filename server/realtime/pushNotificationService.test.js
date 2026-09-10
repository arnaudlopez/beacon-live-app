import { createECDH, randomBytes } from 'node:crypto';
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

function pushSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/device-1') {
  return {
    endpoint,
    expirationTime: null,
    keys: { p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

function snapshot(avg, gust, now = Date.now()) {
  return { windData: { porticcio: { observedAt: new Date(now).toISOString(), live: { windSpeed: avg, windGust: gust } } } };
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

    await service.handleSnapshot(snapshot(13, 19, now));
    await service.handleSnapshot(snapshot(14, 20, now));
    expect(sender.sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sender.sendNotification.mock.calls[0][1])).toMatchObject({
      title: '⚠️ Alerte Porticcio',
      body: 'raf: 19 kts · moy: 13 kts',
      tag: 'alert-porticcio',
    });

    now += 900_000;
    await service.handleSnapshot(snapshot(14, 20, now));
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

describe('Push safety and freshness', () => {
  it('rejects arbitrary destinations, invalid keys and capacity overflow', async () => {
    const service = await createPushNotificationService({ store: createMemoryStore(), sender: { sendNotification: vi.fn() }, publicKey: 'key', maxSubscriptions: 1 });
    for (const endpoint of ['https://127.0.0.1/push', 'https://evil.test/push', 'https://fcm.googleapis.com.evil.test/push', 'https://user@fcm.googleapis.com/push', 'https://fcm.googleapis.com:8443/push']) {
      await expect(service.upsert({ subscription: pushSubscription(endpoint), alerts: {} })).rejects.toThrow('invalid_push_subscription');
    }
    const invalid = pushSubscription();
    invalid.keys.auth = 'bad';
    await expect(service.upsert({ subscription: invalid, alerts: {} })).rejects.toThrow('invalid_push_subscription_keys');
    await service.upsert({ subscription: pushSubscription(), alerts: {} });
    await expect(service.upsert({ subscription: pushSubscription('https://fcm.googleapis.com/fcm/send/device-2'), alerts: {} })).rejects.toThrow('push_capacity_reached');
  });

  it('never sends from stale, undated, future or unhealthy measurements', async () => {
    const now = Date.now();
    const sender = { sendNotification: vi.fn().mockResolvedValue({}) };
    const service = await createPushNotificationService({ store: createMemoryStore(), sender, publicKey: 'key', clock: { now: () => now } });
    await service.upsert({ subscription: pushSubscription(), alerts: { porticcio: { enabled: true, gustEnabled: true, gustThreshold: 18 } } });
    await service.handleSnapshot(snapshot(20, 25, now - 72 * 3600000));
    await service.handleSnapshot(snapshot(20, 25, now + 3600000));
    const undated = snapshot(20, 25);
    delete undated.windData.porticcio.observedAt;
    await service.handleSnapshot(undated);
    const failed = snapshot(20, 25, now);
    failed.windData.porticcio.sourceStatus = 'error';
    await service.handleSnapshot(failed);
    expect(sender.sendNotification).not.toHaveBeenCalled();
    await service.handleSnapshot(snapshot(20, 25, now));
    expect(sender.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent snapshots instead of duplicating an in-flight alert', async () => {
    let complete;
    const sender = { sendNotification: vi.fn(() => new Promise(resolve => { complete = resolve; })) };
    const service = await createPushNotificationService({ store: createMemoryStore(), sender, publicKey: 'key' });
    await service.upsert({ subscription: pushSubscription(), alerts: { porticcio: { enabled: true, gustEnabled: true, gustThreshold: 18 } } });
    const first = service.handleSnapshot(snapshot(20, 25));
    const second = service.handleSnapshot(snapshot(20, 25));
    complete({});
    await Promise.all([first, second]);
    expect(sender.sendNotification).toHaveBeenCalledTimes(1);
  });
});
