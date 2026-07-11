import { createMonitoringService } from './monitoringService.js';

const monitoring = createMonitoringService();

if (!monitoring.isSentryConfigured() && !monitoring.isHeartbeatConfigured()) {
  console.error('Monitoring smoke requires SENTRY_DSN and/or MONITOR_HEARTBEAT_URL');
  globalThis.process?.exit?.(1);
}

if (monitoring.isSentryConfigured()) {
  monitoring.captureMessage('Beacon Live monitoring smoke test', {
    level: 'warning',
    fingerprint: ['monitoring-smoke-test'],
    tags: { incidentType: 'smoke_test' },
  });
}

const heartbeat = await monitoring.sendHeartbeat();
await monitoring.flush(5_000);

console.log(JSON.stringify({
  sentryConfigured: monitoring.isSentryConfigured(),
  heartbeatConfigured: monitoring.isHeartbeatConfigured(),
  heartbeat,
}));
