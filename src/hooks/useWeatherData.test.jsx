// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  })),
}));

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
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
