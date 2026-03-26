import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCached, setCache } from './sessionCache';

// Mock sessionStorage
const mockStorage = {};
const sessionStorageMock = {
  getItem: vi.fn((key) => mockStorage[key] || null),
  setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
};

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

describe('sessionCache', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  describe('setCache + getCached', () => {
    it('stores and retrieves data within TTL', () => {
      const data = { windSpeed: '15.5', windGust: '22.3' };
      setCache('test_key', data);
      const result = getCached('test_key', 60000);
      expect(result).toEqual(data);
    });

    it('returns null for non-existent key', () => {
      expect(getCached('nonexistent', 60000)).toBeNull();
    });

    it('returns null when TTL has expired', () => {
      const data = { value: 42 };
      // Manually insert expired data
      mockStorage['expired_key'] = JSON.stringify({
        timestamp: Date.now() - 120000, // 2 minutes ago
        data
      });
      expect(getCached('expired_key', 60000)).toBeNull();
    });

    it('returns data when still within TTL', () => {
      const data = { value: 'fresh' };
      mockStorage['fresh_key'] = JSON.stringify({
        timestamp: Date.now() - 30000, // 30 seconds ago
        data
      });
      expect(getCached('fresh_key', 60000)).toEqual(data);
    });
  });

  describe('edge cases', () => {
    it('handles corrupted JSON in sessionStorage', () => {
      mockStorage['bad_key'] = '{invalid json...';
      // Should not throw, returns null
      expect(getCached('bad_key', 60000)).toBeNull();
    });

    it('handles missing timestamp in stored data', () => {
      mockStorage['no_ts'] = JSON.stringify({ data: 'no timestamp' });
      expect(getCached('no_ts', 60000)).toBeNull();
    });

    it('stores complex nested objects', () => {
      const complex = {
        live: { windSpeed: '12.3' },
        history: [{ time: '2024-01-01T00:00:00Z', avgSpeed: 12 }],
      };
      setCache('complex', complex);
      expect(getCached('complex', 60000)).toEqual(complex);
    });

    it('overwrites existing cache for same key', () => {
      setCache('overwrite', { v: 1 });
      setCache('overwrite', { v: 2 });
      expect(getCached('overwrite', 60000)).toEqual({ v: 2 });
    });

    it('uses default TTL of 55000ms', () => {
      const data = { value: 'default-ttl' };
      mockStorage['default_ttl'] = JSON.stringify({
        timestamp: Date.now() - 50000, // 50s ago (within 55s default)
        data
      });
      expect(getCached('default_ttl')).toEqual(data);

      mockStorage['default_ttl_expired'] = JSON.stringify({
        timestamp: Date.now() - 56000, // 56s ago (outside 55s default)
        data
      });
      expect(getCached('default_ttl_expired')).toBeNull();
    });
  });
});
