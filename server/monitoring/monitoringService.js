import * as Sentry from '@sentry/node';
import { classifySourceHealth, providerForSource } from '../realtime/healthStatus.js';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
const DEFAULT_STALE_REMINDER_MS = 6 * 60 * 60 * 1000;
const SENSITIVE_KEY = /authorization|cookie|password|pass|secret|token|api.?key|dsn|endpoint/i;
const QUERY_SECRET = /([?&](?:api(?:_|-)?key|key|token|password|pass|secret)=)[^&]*/gi;

function redactText(value) {
  return typeof value === 'string' ? value.replace(QUERY_SECRET, '$1[Filtered]') : value;
}

function scrubValue(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[Filtered]' : scrubValue(item, depth + 1),
  ]));
}

export function scrubSentryEvent(event) {
  const scrubbed = scrubValue(event);
  if (scrubbed?.request?.url) scrubbed.request.url = redactText(scrubbed.request.url);
  return scrubbed;
}

function errorCode(message = '') {
  const known = String(message).match(/^(upstream_(?:http_\d+|timeout|invalid_json_[a-z_]+)|windsup_[a-z_]+(?:_\d+)?|wunderground_[a-z_]+)/i);
  return known?.[1] ?? (String(message).split(':')[0].slice(0, 120) || 'unknown_error');
}

function jsonLog(logger, level, payload) {
  logger?.[level]?.(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

export function createMonitoringService({
  env = globalThis.process?.env ?? {},
  fetchImpl = globalThis.fetch,
  clock = { now: () => Date.now() },
  logger = globalThis.console,
  sentry = Sentry,
} = {}) {
  const dsn = env.SENTRY_DSN || '';
  const heartbeatUrl = env.MONITOR_HEARTBEAT_URL || '';
  const heartbeatIntervalMs = Number(env.MONITOR_HEARTBEAT_INTERVAL_MS || DEFAULT_HEARTBEAT_INTERVAL_MS);
  const configured = Boolean(dsn);
  const sourceStates = new Map();
  let lastHeartbeatAt = 0;

  if (configured) {
    sentry.init({
      dsn,
      environment: env.APP_ENV || 'production',
      release: env.APP_RELEASE || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: scrubSentryEvent,
    });
  }

  function captureMessage(message, { level = 'warning', fingerprint, tags = {}, extra = {} } = {}) {
    jsonLog(logger, level === 'error' ? 'error' : 'warn', { type: 'monitoring_event', level, message, tags, extra });
    if (!configured) return null;
    return sentry.withScope((scope) => {
      scope.setLevel(level);
      if (fingerprint) scope.setFingerprint(fingerprint);
      for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
      scope.setExtras(scrubValue(extra));
      return sentry.captureMessage(message, level);
    });
  }

  function captureException(error, { fingerprint, tags = {}, extra = {} } = {}) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    jsonLog(logger, 'error', { type: 'backend_exception', message: normalized.message, tags });
    if (!configured) return null;
    return sentry.withScope((scope) => {
      if (fingerprint) scope.setFingerprint(fingerprint);
      for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
      scope.setExtras(scrubValue(extra));
      return sentry.captureException(normalized);
    });
  }

  function handleSourceError(event) {
    const { sourceId, error = {}, consecutiveFailures = 1 } = event;
    const code = errorCode(error.message);
    const unexpected = !/^(upstream_|windsup_|wunderground_)/.test(code);
    const shouldReport = (unexpected && consecutiveFailures === 1)
      || consecutiveFailures === 3
      || (consecutiveFailures > 3 && (consecutiveFailures - 3) % 30 === 0);
    sourceStates.set(sourceId, { status: 'error', code, consecutiveFailures });
    if (!shouldReport) return;
    const tags = { sourceId, provider: providerForSource(sourceId), errorCode: code, incidentType: 'provider_error' };
    const extra = { consecutiveFailures, lastAttemptAt: event.lastAttemptAt };
    if (unexpected) {
      const exception = new Error(error.message || code);
      exception.name = error.name || 'ProviderError';
      if (error.stack) exception.stack = error.stack;
      captureException(exception, { fingerprint: ['provider-error', sourceId, code], tags, extra });
    } else {
      captureMessage(`Weather provider failing: ${sourceId} (${code})`, {
        level: 'warning', fingerprint: ['provider-error', sourceId, code], tags, extra,
      });
    }
  }

  function handleSourceRecovery(event) {
    const previous = sourceStates.get(event.sourceId);
    sourceStates.set(event.sourceId, { status: 'healthy' });
    if ((event.previousFailures ?? previous?.consecutiveFailures ?? 0) < 3) return;
    captureMessage(`Weather provider recovered: ${event.sourceId}`, {
      level: 'info',
      fingerprint: ['provider-recovery', event.sourceId],
      tags: { sourceId: event.sourceId, provider: providerForSource(event.sourceId), incidentType: 'provider_recovery' },
      extra: { previousFailures: event.previousFailures, recoveredAt: event.recoveredAt },
    });
  }

  function handlePollComplete(event) {
    const now = clock.now();
    for (const sourceId of event.sources ?? []) {
      const health = event.sourceHealth?.[sourceId];
      if (!health || health.status !== 'ok') continue;
      const classified = classifySourceHealth(sourceId, health, now);
      const previous = sourceStates.get(sourceId);
      sourceStates.set(sourceId, {
        status: classified.status,
        lastStaleReportAt: previous?.lastStaleReportAt,
      });
      if (!['stale', 'unavailable'].includes(classified.status)) continue;
      const lastReportAt = previous?.lastStaleReportAt ?? 0;
      if (now - lastReportAt < DEFAULT_STALE_REMINDER_MS) continue;
      sourceStates.set(sourceId, { status: classified.status, lastStaleReportAt: now });
      captureMessage(`Weather observation ${classified.status}: ${sourceId}`, {
        level: 'warning',
        fingerprint: ['provider-freshness', sourceId, classified.status],
        tags: { sourceId, provider: classified.provider, incidentType: 'provider_freshness', freshness: classified.status },
        extra: {
          lastObservedAt: classified.lastObservedAt,
          observationAgeMs: classified.observationAgeMs,
          staleAfterMs: classified.staleAfterMs,
        },
      });
    }
  }

  function handleRuntimeEvent(event) {
    if (event?.type === 'weather:source-error') handleSourceError(event);
    else if (event?.type === 'weather:source-recovery') handleSourceRecovery(event);
    else if (event?.type === 'weather:poll-complete') handlePollComplete(event);
  }

  async function sendHeartbeat() {
    if (!heartbeatUrl || typeof fetchImpl !== 'function') return { sent: false, reason: 'not_configured' };
    const now = clock.now();
    if (now - lastHeartbeatAt < heartbeatIntervalMs) return { sent: false, reason: 'throttled' };
    lastHeartbeatAt = now;
    try {
      const response = await fetchImpl(heartbeatUrl, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`heartbeat_http_${response.status}`);
      return { sent: true };
    } catch (error) {
      captureException(error, {
        fingerprint: ['monitor-heartbeat-failed'],
        tags: { incidentType: 'monitoring_delivery' },
      });
      return { sent: false, reason: error?.message || 'heartbeat_failed' };
    }
  }

  return {
    isSentryConfigured: () => configured,
    isHeartbeatConfigured: () => Boolean(heartbeatUrl),
    handleRuntimeEvent,
    captureException,
    captureMessage,
    sendHeartbeat,
    flush: (timeoutMs = 2_000) => configured ? sentry.flush(timeoutMs) : Promise.resolve(true),
  };
}
