// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HistoricalChart from './HistoricalChart';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  ComposedChart: ({ syncId, syncMethod }) => (
    <div data-sync-id={syncId || ''} data-sync-method={syncMethod || ''} />
  ),
  Area: () => null,
  Line: () => null,
  Scatter: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

describe('HistoricalChart', () => {
  beforeEach(() => {
    const store = new Map();
    const localStorageMock = {
      getItem: vi.fn((key) => store.get(key) ?? null),
      setItem: vi.fn((key, value) => store.set(key, String(value))),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });
  });

  it('synchronizes wind and direction charts on the same timeline', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <HistoricalChart
          data={[
            {
              time: '2026-06-11T06:00:00.000Z',
              avgSpeed: 12,
              maxGust: 16,
              temperature: 22,
              windDirection: 250,
            },
            {
              time: '2026-06-11T06:20:00.000Z',
              avgSpeed: 14,
              maxGust: 18,
              temperature: 23,
              windDirection: 260,
            },
          ]}
        />,
      );
    });

    const charts = [...container.querySelectorAll('[data-sync-id="historical-weather-timeline"]')];
    expect(charts).toHaveLength(2);
    expect(charts.every((chart) => chart.dataset.syncMethod === 'value')).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
