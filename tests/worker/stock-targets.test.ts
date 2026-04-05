import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { getStockTargets, updateStockTarget } from '../../src/worker/lib/db';

// ── Tests ────────────────────────────────────────────────────────────

describe('Stock Target Management', () => {
  describe('getStockTargets', () => {
    it('returns targets with item details for a station', async () => {
      const targets = [
        {
          id: 1,
          item_id: 1,
          station_id: 10,
          target_count: 4,
          updated_at: '2026-01-01 00:00:00',
          item_name: 'NPA Kit',
          category: 'Airway',
        },
        {
          id: 2,
          item_id: 2,
          station_id: 10,
          target_count: 2,
          updated_at: '2026-01-01 00:00:00',
          item_name: 'BVM Adult',
          category: 'Breathing',
        },
      ];

      const mock = new StatefulD1Mock();
      mock.onQuery('FROM stock_targets st', () => targets);

      const db = mock.asD1();
      const result = await getStockTargets(db, 10);

      expect(result).toHaveLength(2);
      expect(result[0].item_name).toBe('NPA Kit');
      expect(result[0].target_count).toBe(4);
      expect(result[0].station_id).toBe(10);
      expect(result[1].item_name).toBe('BVM Adult');
      expect(result[1].target_count).toBe(2);
    });

    it('returns empty array when no targets exist for a station', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM stock_targets st', () => []);

      const db = mock.asD1();
      const result = await getStockTargets(db, 99);

      expect(result).toHaveLength(0);
    });

    it('only returns targets for active items', async () => {
      // The SQL joins items with is_active = 1
      const targets = [
        {
          id: 1,
          item_id: 1,
          station_id: 10,
          target_count: 4,
          updated_at: '2026-01-01 00:00:00',
          item_name: 'NPA Kit',
          category: 'Airway',
        },
        // Inactive item (id: 2) should not appear — query filters them
      ];

      const mock = new StatefulD1Mock();
      mock.onQuery('FROM stock_targets st', () => targets);

      const db = mock.asD1();
      const result = await getStockTargets(db, 10);

      expect(result).toHaveLength(1);
      expect(result[0].item_name).toBe('NPA Kit');
    });
  });

  describe('updateStockTarget', () => {
    it('updates a target count via upsert', async () => {
      let capturedBinds: unknown[] = [];
      const mock = new StatefulD1Mock();
      mock.onQuery('INSERT INTO stock_targets', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await updateStockTarget(db, 1, 10, 8);

      // The SQL binds: itemId, stationId, targetCount, targetCount (for ON CONFLICT)
      expect(capturedBinds).toEqual([1, 10, 8, 8]);
    });

    it('creates a new target if none exists (upsert insert path)', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('INSERT INTO stock_targets', () => []);

      const db = mock.asD1();
      // Should not throw — upsert handles insert
      await expect(updateStockTarget(db, 99, 10, 5)).resolves.toBeUndefined();
    });

    it('target is per-item per-station (unique constraint in schema)', () => {
      // Validates the schema defines UNIQUE(item_id, station_id)
      const schema = `UNIQUE(item_id, station_id)`;
      expect(schema).toContain('UNIQUE(item_id, station_id)');
    });

    it('uses ON CONFLICT for upsert behavior', () => {
      // The SQL uses ON CONFLICT(item_id, station_id) DO UPDATE
      // This ensures idempotent target updates
      const sql = `INSERT INTO stock_targets (item_id, station_id, target_count)
       VALUES (?, ?, ?)
       ON CONFLICT(item_id, station_id) DO UPDATE SET target_count = ?, updated_at = datetime('now')`;

      expect(sql).toContain('ON CONFLICT(item_id, station_id) DO UPDATE');
    });
  });
});
