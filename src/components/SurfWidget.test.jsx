// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import SurfWidget from './SurfWidget';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  Marker: () => null,
  useMap: () => ({ flyTo: vi.fn() }),
}));

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
  },
}));

vi.mock('./SurfHistoryChart', () => ({
  default: () => <div data-testid="surf-history-chart" />,
}));

const mockSurfData = {
  ajaccio: {
    height: 0.9,
    hmax: 1.3,
    period: 4,
    direction: 240,
    surfHistory: [{ time: Date.now() - 600_000, height: 0.9 }],
  },
  alistro: {
    height: 0.2,
    hmax: 0.3,
    period: 3.5,
    direction: 21,
    spread: 26,
    waterTemp: 22.1,
    surfHistory: [{ time: Date.now() - 300_000, height: 0.2 }],
  },
};

const mockWindData = {
  ajaccio_buoy: {
    live: { windSpeed: 9, windGust: 14, windDirection: 270 },
  },
  'owm-1202': {
    live: { windSpeed: 8, windGust: 12, windDirection: 80 },
  },
};

describe('SurfWidget', () => {
  it('exposes the Alistro CANDHIS buoy and can select it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<SurfWidget surfData={mockSurfData} windData={mockWindData} />);
    });

    const alistroButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Alistro'));
    expect(alistroButton).toBeTruthy();
    expect(alistroButton.disabled).toBe(false);

    act(() => {
      alistroButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Conditions Surf');
    expect(container.textContent).toContain('Alistro');
    expect(container.textContent).toContain('02B05');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
