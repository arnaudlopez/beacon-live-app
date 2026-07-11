import { describe, expect, it, vi } from 'vitest';
import { createMonitoringService, scrubSentryEvent } from './monitoringService.js';

function createSentryDouble() {
  const scope = {
    setLevel: vi.fn(),
    setFingerprint: vi.fn(),
    setTag: vi.fn(),
    setExtras: vi.fn(),
  };
  return {
    scope,
    init: vi.fn(),
    withScope: vi.fn((callback) => callback(scope)),
    captureMessage: vi.fn(() => 'message-id'),
    captureException: vi.fn(() => 'exception-id'),
    flush: vi.fn().mockResolvedValue(true),
  };
}

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };

describe('backend monitoring service', () => {
  it('scrubs secrets before events leave the backend', () => {
    expect(scrubSentryEvent({
      request: {
        url: 'https://api.example.test/data?apiKey=secret-value&station=1',
        headers: { Authorization: 'Bearer secret', Accept: 'application/json' },
      },
      extra: { password: 'secret', nested: { token: 'secret' } },
    })).toEqual({
      request: {
        url: 'https://api.example.test/data?apiKey=[Filtered]&station=1',
        headers: { Authorization: '[Filtered]', Accept: 'application/json' },
      },
      extra: { password: '[Filtered]', nested: { token: '[Filtered]' } },
    });
  });

  it('reports an expected provider failure at the third occurrence and then throttles it', () => {
    const sentry = createSentryDouble();
    const service = createMonitoringService({ env: { SENTRY_DSN: 'https://public@sentry.invalid/1' }, sentry, logger });
    const base = {
      type: 'weather:source-error',
      sourceId: 'wunderground_IGROSS105',
      error: { name: 'Error', message: 'upstream_invalid_json_empty_body' },
    };

    service.handleRuntimeEvent({ ...base, consecutiveFailures: 1 });
    service.handleRuntimeEvent({ ...base, consecutiveFailures: 2 });
    expect(sentry.captureMessage).not.toHaveBeenCalled();

    service.handleRuntimeEvent({ ...base, consecutiveFailures: 3 });
    service.handleRuntimeEvent({ ...base, consecutiveFailures: 4 });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith([
      'provider-error', 'wunderground_IGROSS105', 'upstream_invalid_json_empty_body',
    ]);
  });

  it('reports unexpected bugs immediately with their stack trace', () => {
    const sentry = createSentryDouble();
    const service = createMonitoringService({ env: { SENTRY_DSN: 'https://public@sentry.invalid/1' }, sentry, logger });
    service.handleRuntimeEvent({
      type: 'weather:source-error',
      sourceId: 'windsup_porticcio',
      consecutiveFailures: 1,
      error: { name: 'TypeError', message: 'Cannot read properties of null', stack: 'TypeError: boom\n at adapter.js:1' },
    });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException.mock.calls[0][0].stack).toContain('adapter.js:1');
  });

  it('reports recovery only after a provider incident crossed the threshold', () => {
    const sentry = createSentryDouble();
    const service = createMonitoringService({ env: { SENTRY_DSN: 'https://public@sentry.invalid/1' }, sentry, logger });
    service.handleRuntimeEvent({
      type: 'weather:source-recovery', sourceId: 'windsup_porticcio', previousFailures: 2,
    });
    service.handleRuntimeEvent({
      type: 'weather:source-recovery', sourceId: 'windsup_porticcio', previousFailures: 3,
    });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage.mock.calls[0][0]).toContain('recovered');
  });

  it('sends and throttles the external scheduler heartbeat', async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok'));
    const service = createMonitoringService({
      env: { MONITOR_HEARTBEAT_URL: 'https://uptime.example.test/heartbeat', MONITOR_HEARTBEAT_INTERVAL_MS: '60000' },
      fetchImpl,
      clock: { now: () => now },
      logger,
    });

    await expect(service.sendHeartbeat()).resolves.toEqual({ sent: true });
    await expect(service.sendHeartbeat()).resolves.toEqual({ sent: false, reason: 'throttled' });
    now += 60_000;
    await expect(service.sendHeartbeat()).resolves.toEqual({ sent: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
