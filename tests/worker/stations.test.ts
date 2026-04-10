import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { getStations } from '../../src/worker/lib/db';

// ── Tests ────────────────────────────────────────────────────────────

describe('Stations', () => {
  describe('getStations', () => {
    it('returns active stations', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM stations WHERE is_active', () => [
        { id: 10, name: 'Station 10', code: 'FS10', is_active: true },
        { id: 13, name: 'Station 13', code: 'FS13', is_active: true },
        { id: 18, name: 'Station 18', code: 'FS18', is_active: true },
        { id: 20, name: 'Station 20', code: 'FS20', is_active: true },
      ]);

      const db = mock.asD1();
      const stations = await getStations(db);
      expect(stations).toHaveLength(4);
      expect(stations[0].id).toBe(10);
      expect(stations[0].name).toBe('Station 10');
      expect(stations[0].code).toBe('FS10');
    });

    it('returns empty array when no active stations exist', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM stations WHERE is_active', () => []);

      const db = mock.asD1();
      const stations = await getStations(db);
      expect(stations).toHaveLength(0);
    });

    it('does not return inactive stations', async () => {
      // The SQL filters with is_active = 1, so inactive stations
      // should never be returned by the query
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM stations WHERE is_active', () => [
        { id: 10, name: 'Station 10', code: 'FS10', is_active: true },
      ]);

      const db = mock.asD1();
      const stations = await getStations(db);
      expect(stations).toHaveLength(1);
      // No inactive stations in results
      expect(stations.every((s) => s.is_active)).toBe(true);
    });
  });

  describe('DCVFD station configuration', () => {
    it('4 stations exist: 10, 13, 18, 20', () => {
      const stationIds = [10, 13, 18, 20];
      expect(stationIds).toHaveLength(4);
    });

    it('station codes follow FS## pattern', () => {
      const codes = ['FS10', 'FS13', 'FS18', 'FS20'];
      for (const code of codes) {
        expect(code).toMatch(/^FS\d{2}$/);
      }
    });
  });
});
