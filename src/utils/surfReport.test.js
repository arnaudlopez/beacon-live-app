import { describe, it, expect } from 'vitest';
import { getSurfReport } from './surfReport';

const makeWind = (speed, gust, direction) => ({
  windSpeed: speed,
  windGust: gust,
  windDirection: direction,
});

const makeSurf = (height, hmax, period, direction, waterTemp = null, spread = null) => ({
  height, hmax, period, direction, waterTemp, spread,
});

describe('getSurfReport', () => {
  // ── Null safety ──
  describe('null safety', () => {
    it('returns null when surf is null', () => {
      expect(getSurfReport(null, makeWind(10, 15, 270), 'Test')).toBeNull();
    });

    it('handles null wind gracefully', () => {
      const result = getSurfReport(makeSurf(1.2, 1.8, 10, 270), null, 'Test');
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('verdict');
    });

    it('handles undefined wind gracefully', () => {
      const result = getSurfReport(makeSurf(1.0, 1.5, 8, 270), undefined, 'Test');
      expect(result).not.toBeNull();
    });
  });

  // ── Flat conditions ──
  describe('flat conditions', () => {
    it('returns "Flat" when wave height < 0.2m', () => {
      const result = getSurfReport(makeSurf(0.1, 0.15, 5, 270), makeWind(5, 8, 90), 'Test');
      expect(result.verdict).toBe('Flat');
      expect(result.verdictColor).toBe('#94a3b8');
    });

    it('returns "Flat" for zero height', () => {
      const result = getSurfReport(makeSurf(0, 0, 0, 0), makeWind(0, 0, 0), 'Test');
      expect(result.verdict).toBe('Flat');
    });
  });

  // ── Offshore conditions ──
  describe('offshore wind', () => {
    it('returns "Go surf !" with good swell + offshore wind', () => {
      // Swell from W (270°), wind from E (90°) → diff 180° → offshore
      const result = getSurfReport(makeSurf(1.5, 2.2, 10, 270), makeWind(8, 12, 90), 'Test');
      expect(result.verdict).toBe('Go surf !');
      expect(result.verdictColor).toBe('#10b981');
    });

    it('returns "Petit mais propre" with small swell + offshore wind', () => {
      const result = getSurfReport(makeSurf(0.3, 0.5, 4, 270), makeWind(5, 8, 90), 'Test');
      expect(result.verdict).toBe('Petit mais propre');
    });
  });

  // ── Onshore conditions ──
  describe('onshore wind', () => {
    it('returns "Pas top" with same wind and swell direction', () => {
      // Both from W (270°) → diff 0° → onshore
      const result = getSurfReport(makeSurf(1.5, 2.0, 8, 270), makeWind(12, 18, 270), 'Test');
      expect(result.verdict).toBe('Pas top');
      expect(result.verdictColor).toBe('#ef4444');
    });
  });

  // ── Cross-shore conditions ──
  describe('cross-shore wind', () => {
    it('returns "Jouable" with crosswind', () => {
      // Swell from W (270°), wind from N (0°) → diff ~90° → cross-shore
      const result = getSurfReport(makeSurf(1.0, 1.5, 8, 270), makeWind(10, 14, 360), 'Test');
      expect(result.verdict).toBe('Jouable');
      expect(result.verdictColor).toBe('#f59e0b');
    });
  });

  // ── Calm wind ──
  describe('calm wind', () => {
    it('returns "Go surf !" with good swell and calm wind', () => {
      const result = getSurfReport(makeSurf(1.0, 1.8, 9, 270), makeWind(1, 2, 0), 'Test');
      expect(result.verdict).toBe('Go surf !');
    });

    it('mentions glassy in detail', () => {
      const result = getSurfReport(makeSurf(0.8, 1.2, 7, 270), makeWind(0, 0, 0), 'Test');
      expect(result.detail).toContain('glassy');
    });
  });

  // ── Report structure ──
  describe('report structure', () => {
    it('returns all expected fields', () => {
      const result = getSurfReport(makeSurf(1.5, 2.2, 10, 270), makeWind(8, 12, 90), 'Revellata');
      expect(result).toHaveProperty('emoji');
      expect(result).toHaveProperty('headline');
      expect(result).toHaveProperty('detail');
      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('verdictColor');
      expect(result).toHaveProperty('setInfo');
    });

    it('headline mentions spot name for flat conditions', () => {
      const result = getSurfReport(makeSurf(0, 0, 0, 0), makeWind(0, 0, 0), 'La Revellata');
      expect(result.headline).toContain('La Revellata');
    });

    it('headline contains wave height for active conditions', () => {
      const result = getSurfReport(makeSurf(1.5, 2.2, 10, 270), makeWind(8, 12, 90), 'Test');
      expect(result.headline).toContain('1.5m');
    });
  });

  // ── Swell quality classification ──
  describe('swell quality', () => {
    it('identifies groundswell (period >= 10s)', () => {
      const result = getSurfReport(makeSurf(1.5, 2.2, 12, 270), makeWind(1, 2, 0), 'Test');
      expect(result.headline).toContain('groundswell');
    });

    it('identifies decent swell (period 7-9s)', () => {
      const result = getSurfReport(makeSurf(1.0, 1.5, 8, 270), makeWind(1, 2, 0), 'Test');
      expect(result.headline).toContain('houle correcte');
    });

    it('identifies windswell (period < 7s)', () => {
      const result = getSurfReport(makeSurf(0.8, 1.2, 5, 270), makeWind(1, 2, 0), 'Test');
      expect(result.headline).toContain('houle de vent');
    });
  });

  // ── Wave set estimation ──
  describe('wave set estimation', () => {
    it('returns setInfo for valid swell', () => {
      const result = getSurfReport(makeSurf(1.5, 2.2, 10, 270), makeWind(5, 8, 90), 'Test');
      expect(result.setInfo).not.toBeNull();
      expect(result.setInfo).toHaveProperty('wavesPerSet');
      expect(result.setInfo).toHaveProperty('setIntervalSec');
      expect(result.setInfo).toHaveProperty('setIntervalLabel');
      expect(result.setInfo).toHaveProperty('regularity');
      expect(result.setInfo).toHaveProperty('description');
    });

    it('returns null setInfo for flat conditions', () => {
      const result = getSurfReport(makeSurf(0.05, 0.1, 2, 0), makeWind(0, 0, 0), 'Test');
      expect(result.setInfo).toBeNull();
    });

    it('uses spectral spread when available', () => {
      const surf = makeSurf(1.5, 2.2, 10, 270, null, 15); // narrow spread
      const result = getSurfReport(surf, makeWind(5, 8, 90), 'Test');
      expect(result.setInfo.spectralSpread).toBe(15);
      expect(result.setInfo.description).toContain('étalement');
    });

    it('groundswell has more waves per set than windswell', () => {
      const gs = getSurfReport(makeSurf(1.5, 2.5, 12, 270), makeWind(5, 8, 90), 'Test');
      const ws = getSurfReport(makeSurf(1.5, 2.0, 5, 270), makeWind(5, 8, 90), 'Test');
      const gsAvg = (gs.setInfo.wavesPerSet[0] + gs.setInfo.wavesPerSet[1]) / 2;
      const wsAvg = (ws.setInfo.wavesPerSet[0] + ws.setInfo.wavesPerSet[1]) / 2;
      expect(gsAvg).toBeGreaterThan(wsAvg);
    });
  });
});
