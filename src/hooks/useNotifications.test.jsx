// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from './useNotifications';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const roots = [];
function HookHarness({ useHook, onRender }) { onRender(useHook()); return null; }
function renderHook(useHook, options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const resultRef = { current: null };
  const Wrapper = options.wrapper || React.Fragment;
  root.render(<Wrapper><HookHarness useHook={useHook} onRender={value => { resultRef.current = value; }} /></Wrapper>);
  return { result: resultRef };
}
function cleanup() {
  act(() => { for (const { root, container } of roots.splice(0)) { root.unmount(); container.remove(); } });
}

const storageValues = new Map();
const storageMock = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => storageValues.set(key, String(value)), clear: () => storageValues.clear() };

const key = 'beacon_notification_settings_v2';
const enabled = { porticcio: { enabled: true, gustEnabled: true, gustThreshold: 18, avgEnabled: false, avgThreshold: 10 } };
let registration;
let subscription;
function response(value) { return { ok: true, json: async () => value }; }
async function render(data = {}) {
  let hook;
  await act(async () => { hook = renderHook(() => useNotifications(data)); });
  return hook;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', storageMock);
  localStorage.clear();
  subscription = { endpoint: 'https://fcm.googleapis.com/device', toJSON: () => ({}), unsubscribe: vi.fn().mockResolvedValue(true) };
  registration = {
    active: true,
    pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription), subscribe: vi.fn().mockResolvedValue(subscription) },
    showNotification: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') }));
  vi.stubGlobal('PushManager', vi.fn());
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration), getRegistration: vi.fn().mockResolvedValue(registration) } });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ configured: true, publicKey: 'AQID' })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete navigator.serviceWorker;
});

describe('Push reconciliation and activation', () => {
  it('recovers from startup failure on online instead of falling back to local alerts', async () => {
    localStorage.setItem(key, JSON.stringify(enabled));
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = await render();
    expect(result.current.pushConfigured).toBe(null);
    expect(result.current.pushSubscribed).toBe(false);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(result.current.pushConfigured).toBe(true);
    expect(result.current.pushSubscribed).toBe(true);
    expect(result.current.deliveryError).toBe('');
  });
  it('removes an existing server subscription even after configuration lookup failed', async () => {
    localStorage.setItem(key, JSON.stringify(enabled));
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = await render();
    await act(async () => { await result.current.toggle('porticcio', 'Porticcio'); });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/push/subscriptions'), expect.objectContaining({ method: 'DELETE' }));
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.settings.porticcio.enabled).toBe(false);
  });
  it('keeps ON and reports an unconfirmed deactivation when the server is unreachable', async () => {
    localStorage.setItem(key, JSON.stringify(enabled));
    const { result } = await render();
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => { await result.current.toggle('porticcio', 'Porticcio'); });
    expect(result.current.settings.porticcio.enabled).toBe(true);
    expect(result.current.deliveryError).toContain('Désactivation non confirmée');
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });
  it('does not produce local notifications from old data when Push is unconfigured', async () => {
    localStorage.setItem(key, JSON.stringify(enabled));
    fetch.mockResolvedValue(response({ configured: false }));
    await render({ porticcio: { observedAt: new Date(Date.now() - 72 * 3600000).toISOString(), live: { windSpeed: 20, windGust: 25 } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(registration.showNotification).not.toHaveBeenCalled();
  });
  it('serializes double activation clicks and preserves success if confirmation notification fails', async () => {
    registration.pushManager.getSubscription.mockResolvedValue(null);
    registration.showNotification.mockRejectedValue(new Error('display failed'));
    const { result } = await render();
    await act(async () => {
      await Promise.all([result.current.toggle('porticcio', 'Porticcio'), result.current.toggle('porticcio', 'Porticcio')]);
    });
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(result.current.settings.porticcio.enabled).toBe(true);
    expect(result.current.deliveryError).toBe('');
  });
  it('finishes reconciliation under React StrictMode without waiting for the retry interval', async () => {
    localStorage.setItem(key, JSON.stringify(enabled));
    let hook;
    await act(async () => { hook = renderHook(() => useNotifications({}), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(hook.result.current.pushSubscribed).toBe(true);
    expect(hook.result.current.isBusy).toBe(false);
  });
});
