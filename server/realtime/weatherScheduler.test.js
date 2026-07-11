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

  it('runs the success hook after a completed poll and routes hook failures to onError', async () => {
    const runtime = { pollDueSources: vi.fn().mockResolvedValue([{ type: 'weather:update' }]) };
    const onSuccess = vi.fn().mockRejectedValue(new Error('heartbeat unavailable'));
    const onError = vi.fn();
    const scheduler = createWeatherScheduler({ runtime, onSuccess, onError });

    await expect(scheduler.pollOnce()).resolves.toEqual([]);
    expect(onSuccess).toHaveBeenCalledWith([{ type: 'weather:update' }]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'heartbeat unavailable' }));
  });
});
