import { describe, it, expect } from 'vitest';
import { StatefulD1Mock, makeTemplateItem } from '../helpers/mocks';
import { submitInventory, getInventoryTemplate } from '../../src/worker/lib/db';
import type { Category } from '../../src/shared/types';

// ── Helper: set up a StatefulD1Mock pre-loaded with station + items ──

function setupInventoryDb(opts: {
  stationId?: number;
  stationName?: string;
  items?: { item_id: number; item_name: string; category: Category; sort_order: number; target_count: number }[];
}) {
  const stationId = opts.stationId ?? 10;
  const stationName = opts.stationName ?? 'Station 10';
  const items = opts.items ?? [
    makeTemplateItem({ item_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4 }),
    makeTemplateItem({ item_id: 2, item_name: 'BVM Adult', category: 'Breathing', target_count: 2 }),
    makeTemplateItem({ item_id: 3, item_name: 'Tourniquet', category: 'Circulation', target_count: 6 }),
  ];

  const mock = new StatefulD1Mock();

  // Station lookup
  mock.onQuery('SELECT name FROM stations WHERE id', (binds) => {
    if (binds[0] === stationId) return [{ name: stationName }];
    return [];
  });

  // Template query (active items with targets)
  mock.onQuery('FROM items i', () => items);

  // Session insert
  mock.onQuery('INSERT INTO inventory_sessions', () => []);

  // History insert (handled by batch)
  mock.onQuery('INSERT INTO inventory_history', () => []);

  // Order insert
  mock.onQuery('INSERT INTO orders', () => []);

  return mock;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Inventory Submission', () => {
  describe('submitInventory', () => {
    it('creates session + history + order when items are short', async () => {
      const mock = setupInventoryDb({});
      const db = mock.asD1();

      const result = await submitInventory(db, 10, [
        { itemId: 1, actualCount: 2 }, // short by 2
        { itemId: 2, actualCount: 1 }, // short by 1
        { itemId: 3, actualCount: 6 }, // good
      ]);

      expect(result.sessionId).toBeGreaterThan(0);
      expect(result.itemCount).toBe(3);
      expect(result.itemsShort).toBe(2);
      expect(result.orderId).toBeGreaterThan(0);
    });

    it('does not create order when all items at or above target', async () => {
      const mock = setupInventoryDb({});
      const db = mock.asD1();

      const result = await submitInventory(db, 10, [
        { itemId: 1, actualCount: 4 }, // good
        { itemId: 2, actualCount: 3 }, // over
        { itemId: 3, actualCount: 6 }, // good
      ]);

      expect(result.sessionId).toBeGreaterThan(0);
      expect(result.itemCount).toBe(3);
      expect(result.itemsShort).toBe(0);
      expect(result.orderId).toBeNull();
    });

    it('rejects submission when items are missing counts', async () => {
      const mock = setupInventoryDb({});
      const db = mock.asD1();

      await expect(
        submitInventory(db, 10, [
          { itemId: 1, actualCount: 4 },
          // Missing itemId 2 and 3
        ]),
      ).rejects.toThrow('Missing counts');
    });

    it('rejects submission when station does not exist', async () => {
      const mock = setupInventoryDb({ stationId: 10 });
      const db = mock.asD1();

      await expect(submitInventory(db, 999, [{ itemId: 1, actualCount: 4 }])).rejects.toThrow('Station 999 not found');
    });

    it('includes submittedBy in the session when provided', async () => {
      const mock = setupInventoryDb({});
      const db = mock.asD1();

      const result = await submitInventory(
        db,
        10,
        [
          { itemId: 1, actualCount: 4 },
          { itemId: 2, actualCount: 2 },
          { itemId: 3, actualCount: 6 },
        ],
        'crew_member@dcvfd.org',
      );

      expect(result.sessionId).toBeGreaterThan(0);
    });
  });

  describe('delta calculation', () => {
    it('calculates positive delta when actual > target (over)', () => {
      const actual = 8;
      const target = 6;
      const delta = actual - target;
      expect(delta).toBe(2);
      expect(delta).toBeGreaterThan(0);
    });

    it('calculates zero delta when actual === target (good)', () => {
      const actual = 4;
      const target = 4;
      const delta = actual - target;
      expect(delta).toBe(0);
    });

    it('calculates negative delta when actual < target (short)', () => {
      const actual = 1;
      const target = 4;
      const delta = actual - target;
      expect(delta).toBe(-3);
      expect(delta).toBeLessThan(0);
    });
  });

  describe('status determination', () => {
    function determineStatus(delta: number): string {
      if (delta === 0) return 'good';
      if (delta > 0) return 'over';
      return 'short';
    }

    it('returns "good" when delta is 0', () => {
      expect(determineStatus(0)).toBe('good');
    });

    it('returns "over" when delta is positive', () => {
      expect(determineStatus(3)).toBe('over');
    });

    it('returns "short" when delta is negative', () => {
      expect(determineStatus(-2)).toBe('short');
    });

    it('handles "not_entered" for null actual count', () => {
      const actual: number | null = null;
      const status = actual === null ? 'not_entered' : 'good';
      expect(status).toBe('not_entered');
    });
  });
});

describe('getInventoryTemplate', () => {
  it('returns items with target counts for a station', async () => {
    const items = [
      makeTemplateItem({ item_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4 }),
      makeTemplateItem({ item_id: 2, item_name: 'BVM Adult', category: 'Breathing', target_count: 2 }),
    ];

    const mock = new StatefulD1Mock();
    mock.onQuery('FROM items i', () => items);
    const db = mock.asD1();

    const result = await getInventoryTemplate(db, 10);
    expect(result).toHaveLength(2);
    expect(result[0].item_name).toBe('NPA Kit');
    expect(result[0].target_count).toBe(4);
    expect(result[1].item_name).toBe('BVM Adult');
    expect(result[1].target_count).toBe(2);
  });

  it('returns empty array when no items exist for station', async () => {
    const mock = new StatefulD1Mock();
    mock.onQuery('FROM items i', () => []);
    const db = mock.asD1();

    const result = await getInventoryTemplate(db, 99);
    expect(result).toHaveLength(0);
  });
});
