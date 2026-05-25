import { describe, expect, it, vi } from 'vitest';
import { createWeatherScheduler } from './weatherScheduler.js';

describe('weather scheduler contract', () => {
  it('polls the runtime on the configured interval and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const runtime = {
        pollDueSources: vi.fn().mockResolvedValue([]),
      };
      const scheduler = createWeatherScheduler({ runtime, intervalMs: 20_000 });

      scheduler.start();
      expect(runtime.pollDueSources).toHaveBeenCalledTimes(1);

      await Promise.resolve();
      vi.advanceTimersByTime(20_000);
      expect(runtime.pollDueSources).toHaveBeenCalledTimes(2);

      scheduler.stop();
      vi.advanceTimersByTime(40_000);
      expect(runtime.pollDueSources).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not overlap polls when a previous poll is still running', async () => {
    vi.useFakeTimers();
    try {
      let resolvePoll;
      const runtime = {
        pollDueSources: vi.fn(() => new Promise((resolve) => {
          resolvePoll = resolve;
        })),
      };
      const scheduler = createWeatherScheduler({ runtime, intervalMs: 20_000 });

      scheduler.start();
      vi.advanceTimersByTime(20_000);
      expect(runtime.pollDueSources).toHaveBeenCalledTimes(1);

      resolvePoll([]);
      await vi.runOnlyPendingTimersAsync();
      vi.advanceTimersByTime(20_000);
      expect(runtime.pollDueSources).toHaveBeenCalledTimes(2);

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
