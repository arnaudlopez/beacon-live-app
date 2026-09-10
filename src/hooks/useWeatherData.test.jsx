// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageValues = new Map();
const storageMock = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => storageValues.set(key, String(value)), clear: () => storageValues.clear() };

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, payload = {}) {
    const event = { data: JSON.stringify(payload) };
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }

  emitError() {
    const event = new Event('error');
    for (const listener of this.listeners.get('error') || []) {
      listener(event);
    }
  }

  close() {
    this.closed = true;
  }
}

function snapshot(windSpeed) {
  return {
    ts: '2026-05-25T08:00:00.000Z',
    windData: {
      porticcio: {
        live: {
          windSpeed,
          windGust: windSpeed + 4,
          windDirection: 270,
        },
        history: [],
      },
    },
    surfData: {},
    waterData: null,
    sourceHealth: {
      windsup_porticcio: {
        status: 'ok',
      },
    },
  };
}

function legacyMarineSnapshot() {
  return {
    ts: '2026-05-25T08:00:00.000Z',
    windData: {
      candhis_revellata: {
        waterTemp: 19.4,
        waterHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), waterTemp: 19.4 }],
        surf: { height: 1.1, hmax: 1.7, period: 8, direction: 260, spread: 35 },
        surfHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), height: 1.1 }],
      },
      candhis_bonifacio: {
        waterTemp: 20.1,
        surf: { height: 0.8, hmax: 1.2, period: 7, direction: 250, spread: 40 },
        surfHistory: [],
      },
      candhis_alistro: {
        waterTemp: 22.1,
        surf: { height: 0.2, hmax: 0.3, period: 3.5, direction: 21, spread: 26 },
        surfHistory: [],
      },
      ajaccio_buoy: {
        live: { windSpeed: 12, windGust: 18, windDirection: 270 },
        history: [],
        height: 1.2,
        hmax: 1.8,
        period: 8,
        direction: 270,
        surfHistory: [{ time: Date.parse('2026-05-25T08:00:00.000Z'), height: 1.2 }],
      },
    },
    surfData: {},
    waterData: null,
    sourceHealth: {},
  };
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  };
}

async function importHook(backendUrl = 'http://backend.local') {
  vi.resetModules();
  vi.stubEnv('VITE_WEATHER_BACKEND_URL', backendUrl);
  return import('./useWeatherData.js');
}

function HookHarness({ useWeatherData, onRender }) {
  onRender(useWeatherData());
  return null;
}

function renderWeatherHook(useWeatherData) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let current;

  act(() => {
    root.render(<HookHarness useWeatherData={useWeatherData} onRender={(value) => {
      current = value;
    }}
    />);
  });

  return {
    result: {
      get current() {
        return current;
      },
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function waitForAssertion(assertion, timeoutMs = 1000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

describe('useWeatherData backend realtime mode', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', storageMock);
    localStorage.clear();
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete globalThis.EventSource;
    delete globalThis.fetch;
  });

  it('loads the backend snapshot, opens SSE, and merges weather:update events into the dashboard shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(snapshot(10)));
    const { useWeatherData } = await importHook();

    const { result, unmount } = renderWeatherHook(useWeatherData);

    await waitForAssertion(() => expect(result.current.isLoading).toBe(false));

    expect(globalThis.fetch).toHaveBeenCalledWith('http://backend.local/api/weather', expect.any(Object));
    expect(result.current.windData.porticcio.live.windSpeed).toBe(10);
    expect(MockEventSource.instances[0].url).toBe('http://backend.local/api/events');

    act(() => {
      MockEventSource.instances[0].emit('weather:update', {
        type: 'weather:update',
        data: snapshot(18),
      });
    });

    await waitForAssertion(() => expect(result.current.windData.porticcio.live.windSpeed).toBe(18));
    expect(result.current.isRealtime).toBe(true);

    unmount();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it('falls back to backend HTTP refresh when the SSE stream errors', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(snapshot(10)))
      .mockResolvedValueOnce(jsonResponse(snapshot(12)));
    const { useWeatherData } = await importHook();

    const { result, unmount } = renderWeatherHook(useWeatherData);

    await waitForAssertion(() => expect(result.current.windData.porticcio.live.windSpeed).toBe(10));

    act(() => {
      MockEventSource.instances[0].emitError();
    });

    await waitForAssertion(() => expect(result.current.windData.porticcio.live.windSpeed).toBe(12));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('does not duplicate the /api prefix when the backend URL is already /api', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(snapshot(10)));
    const { useWeatherData } = await importHook('/api');

    const { result, unmount } = renderWeatherHook(useWeatherData);

    await waitForAssertion(() => expect(result.current.isLoading).toBe(false));

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/weather', expect.any(Object));
    expect(MockEventSource.instances[0].url).toBe('/api/events');

    unmount();
  });

  it('normalizes marine data from persisted backend snapshots into surf and water state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(legacyMarineSnapshot()));
    const { useWeatherData } = await importHook();

    const { result, unmount } = renderWeatherHook(useWeatherData);

    await waitForAssertion(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.surfData.revellata).toMatchObject({
      height: 1.1,
      waterTemp: 19.4,
    });
    expect(result.current.surfData.bonifacio.height).toBe(0.8);
    expect(result.current.surfData.alistro.height).toBe(0.2);
    expect(result.current.surfData.ajaccio.height).toBe(1.2);
    expect(result.current.waterData.current).toBe(19.4);

    unmount();
  });
});

describe('PWA network recovery', () => {
  let hook;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', storageMock);
    localStorage.clear();
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });
  afterEach(() => {
    hook?.unmount();
    hook = null;
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete globalThis.EventSource;
    delete globalThis.fetch;
  });
  async function setup() {
    globalThis.fetch ||= vi.fn().mockResolvedValue(jsonResponse(snapshot(10)));
    const { useWeatherData } = await importHook('/api');
    await act(async () => { hook = renderWeatherHook(useWeatherData); });
    return hook;
  }
  it('reopens SSE after a transient failure and resumes live delivery', async () => {
    await setup();
    const old = MockEventSource.instances[0];
    await act(async () => { old.emitError(); await vi.advanceTimersByTimeAsync(1600); });
    expect(old.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    await act(async () => { MockEventSource.instances[1].emit('weather:update', snapshot(22)); });
    expect(hook.result.current.windData.porticcio.live.windSpeed).toBe(22);
    expect(hook.result.current.connectionStatus).toBe('live');
  });
  it('suspends while hidden and refreshes immediately on return without duplicate requests', async () => {
    await setup();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(120000); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances[0].closed).toBe(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
      window.dispatchEvent(new Event('online'));
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(MockEventSource.instances).toHaveLength(2);
  });
  it('does not let late HTTP data or errors replace newer SSE state', async () => {
    await setup();
    let resolveOld;
    globalThis.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await act(async () => { hook.result.current.refresh(); });
    await act(async () => { MockEventSource.instances[0].emit('weather:update', { ...snapshot(25), ts: '2026-05-25T08:02:00Z' }); });
    await act(async () => { resolveOld(jsonResponse(snapshot(10))); });
    expect(hook.result.current.windData.porticcio.live.windSpeed).toBe(25);
    let rejectOld;
    globalThis.fetch.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
    await act(async () => { hook.result.current.refresh(); });
    await act(async () => { MockEventSource.instances[0].emit('weather:update', { ...snapshot(26), ts: '2026-05-25T08:03:00Z' }); });
    await act(async () => { rejectOld(new TypeError('Failed to fetch')); });
    expect(hook.result.current.error).toBe('');
    expect(hook.result.current.connectionStatus).toBe('live');
  });
  it('opens SSE despite a hung initial fetch, times out HTTP and retries', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    await setup();
    expect(MockEventSource.instances).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
    expect(hook.result.current.isLoading).toBe(false);
    expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    globalThis.fetch.mockResolvedValue(jsonResponse(snapshot(18)));
    await act(async () => { hook.result.current.refresh(); });
    expect(hook.result.current.windData.porticcio.live.windSpeed).toBe(18);
    expect(hook.result.current.error).toBe('');
  });
  it('detects a silent stream but does not poll alongside healthy heartbeats', async () => {
    await setup();
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
        MockEventSource.instances[0].emit('heartbeat');
      });
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(52000); });
    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(MockEventSource.instances.length).toBeGreaterThan(1);
  });
  it('restores the last snapshot offline without presenting it as a live success', async () => {
    localStorage.setItem('beacon_weather_v1:/api', JSON.stringify({ savedAt: Date.now(), snapshot: snapshot(17) }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await setup();
    expect(hook.result.current.windData.porticcio.live.windSpeed).toBe(17);
    expect(hook.result.current.isCached).toBe(true);
    expect(hook.result.current.connectionStatus).toBe('offline');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(hook.result.current.isCached).toBe(false);
  });
  it('rejects malformed snapshots without clearing the last good data', async () => {
    await setup();
    globalThis.fetch.mockResolvedValue(jsonResponse({ ts: 'invalid', windData: {} }));
    await act(async () => { hook.result.current.refresh(); });
    expect(hook.result.current.windData.porticcio.live.windSpeed).toBe(10);
    expect(hook.result.current.error).not.toBe('');
  });
  it('rejects older revisions while accepting a restarted backend epoch', async () => {
    await setup();
    const stream = MockEventSource.instances[0];
    await act(async () => { stream.emit('weather:update', { ...snapshot(20), streamId: 'a', revision: 3 }); });
    await act(async () => { stream.emit('weather:update', { ...snapshot(10), streamId: 'a', revision: 2 }); });
    expect(hook.result.current.windData.porticcio.live.windSpeed).toBe(20);
    await act(async () => { stream.emit('weather:update', { ...snapshot(22), streamId: 'b', revision: 1 }); });
    expect(hook.result.current.windData.porticcio.live.windSpeed).toBe(22);
  });
});
