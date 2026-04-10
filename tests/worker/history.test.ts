import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { getHistory } from '../../src/worker/lib/db';

// ── Tests ────────────────────────────────────────────────────────────

describe('Inventory History', () => {
  describe('getHistory', () => {
    it('returns history records unfiltered', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM inventory_history', () => [
        {
          id: 1,
          item_name: 'NPA Kit',
          category: 'Airway',
          station_name: 'Station 10',
          target_count: 4,
          actual_count: 2,
          delta: -2,
          status: 'short',
          submitted_at: '2026-04-06T12:00:00Z',
          submitted_by: null,
          session_id: '1',
        },
        {
          id: 2,
          item_name: 'BVM Adult',
          category: 'Breathing',
          station_name: 'Station 10',
          target_count: 2,
          actual_count: 2,
          delta: 0,
          status: 'good',
          submitted_at: '2026-04-06T12:00:00Z',
          submitted_by: null,
          session_id: '1',
        },
      ]);

      const db = mock.asD1();
      const history = await getHistory(db);
      expect(history).toHaveLength(2);
    });

    it('filters by stationName', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_history', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getHistory(db, { stationName: 'Station 10' });
      // stationName should be first bind, then limit, offset
      expect(capturedBinds[0]).toBe('Station 10');
    });

    it('filters by sessionId', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_history', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getHistory(db, { sessionId: 5 });
      expect(capturedBinds[0]).toBe(5);
    });

    it('filters by category', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_history', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getHistory(db, { category: 'Airway' });
      expect(capturedBinds[0]).toBe('Airway');
    });

    it('filters by status', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_history', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getHistory(db, { status: 'short' });
      expect(capturedBinds[0]).toBe('short');
    });

    it('combines multiple filters', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_history', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getHistory(db, {
        stationName: 'Station 10',
        category: 'Airway',
        status: 'short',
      });

      // stationName, category, status, then limit and offset
      expect(capturedBinds[0]).toBe('Station 10');
      expect(capturedBinds[1]).toBe('Airway');
      expect(capturedBinds[2]).toBe('short');
    });

    it('defaults limit to 500', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_history', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getHistory(db);
      // With no filters, binds are just [limit, offset]
      expect(capturedBinds).toEqual([500, 0]);
    });

    it('respects custom limit and offset', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_history', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getHistory(db, { limit: 25, offset: 50 });
      expect(capturedBinds).toEqual([25, 50]);
    });

    it('returns empty array when no history exists', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM inventory_history', () => []);

      const db = mock.asD1();
      const history = await getHistory(db, { stationName: 'Station 99' });
      expect(history).toHaveLength(0);
    });
  });
});
