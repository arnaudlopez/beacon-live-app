// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceSelector } from './Dashboard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sources = [
  { id: 'lfkj', name: "Ajaccio - Campo dell'Oro", type: 'meteofrance' },
  { id: 'la_parata', name: 'Ajaccio - La Parata', type: 'meteofrance' },
];

let container;
let root;

afterEach(() => {
  if (root) {
    act(() => root.unmount());
  }
  container?.remove();
  container = null;
  root = null;
});

function renderSelector(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root.render(
      <SourceSelector
        sources={sources}
        windData={{ lfkj: { live: { windSpeed: 10 }, history: [{ time: Date.now() }] } }}
        activeSourceId="lfkj"
        isLoading={false}
        onSourceSelect={vi.fn()}
        {...props}
      />,
    );
  });

  return [...container.querySelectorAll('button')];
}

describe('SourceSelector', () => {
  it('disables a station without live data and explains that it is temporary', () => {
    const [, parataButton] = renderSelector();

    expect(parataButton.disabled).toBe(true);
    expect(parataButton.classList.contains('unavailable')).toBe(true);
    expect(parataButton.textContent).toContain('Indisponible temporairement');
    expect(parataButton.getAttribute('aria-label')).toContain('indisponible temporairement');
  });

  it('keeps stations with live data selectable', () => {
    const onSourceSelect = vi.fn();
    const [campoButton] = renderSelector({ onSourceSelect });

    expect(campoButton.disabled).toBe(false);
    act(() => campoButton.click());
    expect(onSourceSelect).toHaveBeenCalledWith(sources[0]);
  });

  it('disables stale live values when no current observation can be proven', () => {
    const [, parataButton] = renderSelector({
      windData: {
        lfkj: { live: { windSpeed: 10 }, history: [{ time: Date.now() }] },
        la_parata: {
          live: { windSpeed: 7.2, windGust: 9.1 },
          observedAt: '2026-07-18T04:00:00.000Z',
          history: [],
        },
      },
    });

    expect(parataButton.disabled).toBe(true);
    expect(parataButton.textContent).toContain('Indisponible temporairement');
  });

  it('does not announce stations as unavailable while data is loading', () => {
    const buttons = renderSelector({ windData: {}, isLoading: true });

    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(container.textContent).not.toContain('Indisponible temporairement');
  });
});
