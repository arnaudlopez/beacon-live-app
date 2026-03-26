import { describe, it, expect } from 'vitest';
import { getBeaufort, degToCardinal } from './beaufort';

// ──────────────────────────────────────────────
// getBeaufort()
// ──────────────────────────────────────────────
describe('getBeaufort', () => {
  it('returns force 0 for calm (0 kts)', () => {
    expect(getBeaufort(0)).toMatchObject({ force: 0, label: 'Calme plat' });
  });

  it('returns force 0 for NaN input', () => {
    expect(getBeaufort(NaN)).toMatchObject({ force: 0 });
  });

  it('returns force 0 for non-numeric string', () => {
    expect(getBeaufort('abc')).toMatchObject({ force: 0 });
  });

  it('returns force 0 for null', () => {
    expect(getBeaufort(null)).toMatchObject({ force: 0 });
  });

  it('returns force 1 for 2 kts', () => {
    expect(getBeaufort(2)).toMatchObject({ force: 1 });
  });

  it('returns force 4 at boundary (16 kts)', () => {
    expect(getBeaufort(16)).toMatchObject({ force: 4 });
  });

  it('returns force 5 at 17 kts (just above F4 boundary)', () => {
    expect(getBeaufort(17)).toMatchObject({ force: 5 });
  });

  it('returns force 6 for 25 kts', () => {
    expect(getBeaufort(25)).toMatchObject({ force: 6, label: 'Vent frais' });
  });

  it('returns force 8 for 35 kts', () => {
    expect(getBeaufort(35)).toMatchObject({ force: 8, label: 'Coup de vent' });
  });

  it('returns force 12 for extreme winds (100 kts)', () => {
    expect(getBeaufort(100)).toMatchObject({ force: 12, label: 'Ouragan' });
  });

  it('parses string input correctly ("15.5")', () => {
    expect(getBeaufort('15.5')).toMatchObject({ force: 4 });
  });

  it('always returns color and emoji', () => {
    for (let i = 0; i <= 70; i += 5) {
      const result = getBeaufort(i);
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('emoji');
      expect(result.color).toMatch(/^#/);
    }
  });

  it('covers all 13 Beaufort forces from 0 to 12', () => {
    const allForces = new Set();
    const testValues = [0, 1.5, 4, 8, 14, 19, 25, 31, 38, 45, 52, 60, 65];
    testValues.forEach(v => allForces.add(getBeaufort(v).force));
    expect(allForces.size).toBe(13);
  });
});

// ──────────────────────────────────────────────
// degToCardinal()
// ──────────────────────────────────────────────
describe('degToCardinal', () => {
  it('returns N for 0°', () => {
    expect(degToCardinal(0)).toBe('N');
  });

  it('returns N for 360°', () => {
    expect(degToCardinal(360)).toBe('N');
  });

  it('returns E for 90°', () => {
    expect(degToCardinal(90)).toBe('E');
  });

  it('returns S for 180°', () => {
    expect(degToCardinal(180)).toBe('S');
  });

  it('returns W for 270°', () => {
    expect(degToCardinal(270)).toBe('W');
  });

  it('returns NE for 45°', () => {
    expect(degToCardinal(45)).toBe('NE');
  });

  it('returns SW for 225°', () => {
    expect(degToCardinal(225)).toBe('SW');
  });

  it('returns "—" for null', () => {
    expect(degToCardinal(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(degToCardinal(undefined)).toBe('—');
  });

  it('handles negative degrees (wraps around)', () => {
    expect(degToCardinal(-90)).toBe('W');
  });

  it('handles degrees > 360 (wraps around)', () => {
    expect(degToCardinal(450)).toBe('E');
  });

  it('returns one of 16 valid directions for any degree', () => {
    const validDirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    for (let deg = 0; deg < 360; deg += 10) {
      expect(validDirs).toContain(degToCardinal(deg));
    }
  });
});
