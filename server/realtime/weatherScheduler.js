const DEFAULT_INTERVAL_MS = 20_000;

export function createWeatherScheduler({ runtime, intervalMs = DEFAULT_INTERVAL_MS, onError } = {}) {
  if (!runtime || typeof runtime.pollDueSources !== 'function') {
    throw new Error('createWeatherScheduler requires a weather runtime');
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('createWeatherScheduler requires a positive intervalMs');
  }

  let intervalId = null;
  let running = false;
  let polling = false;

  async function pollOnce() {
    if (polling) return [];

    polling = true;
    try {
      return await runtime.pollDueSources();
    } catch (error) {
      onError?.(error);
      return [];
    } finally {
      polling = false;
    }
  }

  function start({ immediate = true } = {}) {
    if (running) return;

    running = true;
    if (immediate) {
      void pollOnce();
    }
    intervalId = setInterval(() => {
      void pollOnce();
    }, intervalMs);
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    running = false;
  }

  return {
    start,
    stop,
    pollOnce,
    isRunning: () => running,
  };
}
