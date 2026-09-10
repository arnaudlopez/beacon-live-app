// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

const state = vi.hoisted(() => ({ weather: {}, notifications: {} }));
vi.mock('../hooks/useWeatherData', () => ({ useWeatherData: () => state.weather }));
vi.mock('../hooks/useNotifications', () => ({ useNotifications: () => state.notifications }));
vi.mock('./WindMapWidget', () => ({ default: () => null }));
vi.mock('./SurfWidget', () => ({ default: () => null }));
vi.mock('./HistoricalChart', () => ({ default: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let container;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  state.weather = {
    windData: {}, surfData: {}, waterData: null, isLoading: false, lastUpdated: null,
    error: 'Connexion interrompue. Nouvelle tentative automatique…',
    isRealtime: false, connectionStatus: 'reconnecting', refresh: vi.fn(),
  };
  state.notifications = {
    settings: {}, DEFAULT_SETTINGS: { enabled: false, avgEnabled: false, avgThreshold: 10, gustEnabled: true, gustThreshold: 15 },
    isBusy: false, pushConfigured: null, deliveryError: '', update: vi.fn(), toggle: vi.fn(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() { await act(async () => { root.render(<Dashboard />); }); }

describe('quiet dashboard recovery', () => {
  it('shows an empty state, not a connection error banner, before the first successful reading', async () => {
    await render();
    expect(container.textContent).not.toContain('Connexion interrompue');
    expect(container.textContent).not.toContain('vérification de la connexion');
    expect(container.querySelector('.error-message')).toBeNull();
    expect(container.querySelector('.weather-empty-state').textContent).toContain('Les relevés ne sont pas encore disponibles');
    expect(container.querySelector('.status-bar').textContent).toContain('Actualisation…');
  });

  it('keeps existing measurements visible during a failed refresh without adding a banner', async () => {
    state.weather.windData = { lfkj: { observedAt: new Date().toISOString(), live: { windSpeed: 12, windGust: 18 }, history: [] } };
    state.weather.lastUpdated = new Date();
    state.weather.isCached = true;
    await render();
    expect(container.textContent).toContain('Vent moyen');
    expect(container.textContent).not.toContain('Connexion interrompue');
    expect(container.textContent).not.toContain('Dernières données conservées');
    expect(container.querySelector('.weather-empty-state')).toBeNull();
    expect(container.querySelector('.error-message')).toBeNull();
  });

  it('still reports an unsuccessful alert deactivation that requires user action', async () => {
    state.notifications.deliveryError = 'Désactivation non confirmée. L’alerte reste active ; réessaie avec une connexion.';
    await render();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Désactivation non confirmée');
  });
});
