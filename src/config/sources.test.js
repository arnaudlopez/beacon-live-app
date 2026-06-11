import { describe, it, expect } from 'vitest';
import {
  SOURCES,
  CANDHIS_STATIONS,
  ESURFMAR_STATION,
  WEATHER_INTERVAL,
  MARINE_INTERVAL,
  CACHE_TTL,
  NOTIF_COOLDOWN,
  DEFAULT_NOTIFICATION_THRESHOLD,
} from './sources';

describe('SOURCES configuration', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SOURCES)).toBe(true);
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it('every source has required fields', () => {
    SOURCES.forEach(source => {
      expect(source).toHaveProperty('id');
      expect(source).toHaveProperty('name');
      expect(source).toHaveProperty('type');
      expect(source).toHaveProperty('coords');
      expect(typeof source.id).toBe('string');
      expect(typeof source.name).toBe('string');
      expect(typeof source.type).toBe('string');
      expect(Array.isArray(source.coords)).toBe(true);
      expect(source.coords).toHaveLength(2);
    });
  });

  it('has no duplicate IDs', () => {
    const ids = SOURCES.map(s => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all coordinates are in Corsica/Mediterranean area', () => {
    SOURCES.forEach(source => {
      const [lat, lon] = source.coords;
      // Corsica: roughly lat 41-43, lon 7-10
      expect(lat).toBeGreaterThanOrEqual(41);
      expect(lat).toBeLessThanOrEqual(43);
      expect(lon).toBeGreaterThanOrEqual(7);
      expect(lon).toBeLessThanOrEqual(10);
    });
  });

  it('all types are valid known types', () => {
    const validTypes = ['meteofrance', 'windsup', 'wunderground', 'esurfmar', 'owm', 'pioupiou'];
    SOURCES.forEach(source => {
      expect(validTypes).toContain(source.type);
    });
  });

  it('sources with stationId have non-empty stationId', () => {
    SOURCES.filter(s => s.stationId).forEach(source => {
      expect(source.stationId.length).toBeGreaterThan(0);
    });
  });

  it('includes Porto Polo as a WindsUp source', () => {
    expect(SOURCES.find(source => source.id === 'porto_polo')).toMatchObject({
      name: 'Porto Polo',
      type: 'windsup',
      stationId: '84',
      coords: [41.7129, 8.81832],
    });
  });

  it('includes Figari Eole as a WindsUp source between Tizzano and Bonifacio', () => {
    const ids = SOURCES.map(source => source.id);
    expect(SOURCES.find(source => source.id === 'figari_eole')).toMatchObject({
      name: 'Figari - Eole',
      type: 'windsup',
      stationId: '1661',
      coords: [41.4655, 9.06925],
    });
    expect(ids.indexOf('figari_eole')).toBe(ids.indexOf('tizzano') + 1);
    expect(ids.indexOf('bonifacio_tramizzi')).toBe(ids.indexOf('figari_eole') + 1);
  });
});

describe('CANDHIS_STATIONS', () => {
  it('has all CANDHIS surf stations', () => {
    expect(CANDHIS_STATIONS).toHaveProperty('revellata');
    expect(CANDHIS_STATIONS).toHaveProperty('bonifacio');
    expect(CANDHIS_STATIONS).toHaveProperty('alistro');
    expect(CANDHIS_STATIONS.alistro).toMatchObject({
      code: '02B05',
      name: 'Alistro',
    });
  });

  it('each station has required fields', () => {
    Object.values(CANDHIS_STATIONS).forEach(station => {
      expect(station).toHaveProperty('id');
      expect(station).toHaveProperty('code');
      expect(station).toHaveProperty('name');
      expect(station).toHaveProperty('coords');
      expect(station.coords).toHaveLength(2);
    });
  });
});

describe('ESURFMAR_STATION', () => {
  it('has required fields', () => {
    expect(ESURFMAR_STATION).toHaveProperty('name');
    expect(ESURFMAR_STATION).toHaveProperty('coords');
    expect(ESURFMAR_STATION).toHaveProperty('url');
    expect(ESURFMAR_STATION.coords).toHaveLength(2);
  });
});

describe('Timing constants', () => {
  it('WEATHER_INTERVAL is a positive number (ms)', () => {
    expect(WEATHER_INTERVAL).toBeGreaterThan(0);
    expect(Number.isFinite(WEATHER_INTERVAL)).toBe(true);
  });

  it('MARINE_INTERVAL is a positive number (ms)', () => {
    expect(MARINE_INTERVAL).toBeGreaterThan(0);
  });

  it('CACHE_TTL and WEATHER_INTERVAL are both positive', () => {
    expect(CACHE_TTL).toBeGreaterThan(0);
    expect(WEATHER_INTERVAL).toBeGreaterThan(0);
  });

  it('NOTIF_COOLDOWN is reasonable (5-60 minutes)', () => {
    expect(NOTIF_COOLDOWN).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(NOTIF_COOLDOWN).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('DEFAULT_NOTIFICATION_THRESHOLD is a positive number', () => {
    expect(DEFAULT_NOTIFICATION_THRESHOLD).toBeGreaterThan(0);
  });
});
