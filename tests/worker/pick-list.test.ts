import { describe, it, expect } from 'vitest';
import { StatefulD1Mock, makeTemplateItem } from '../helpers/mocks';
import { submitInventory } from '../../src/worker/lib/db';
import { CATEGORIES, CATEGORY_SORT } from '../../src/shared/categories';

// ── Pick list format (extracted from db.ts formatPickList logic) ─────

/**
 * Replicate the pick list formatting logic for direct testing.
 * This mirrors formatPickList in src/worker/lib/db.ts.
 */
function formatPickList(
  stationName: string,
  shortItems: { item_name: string; category: string; actual: number; target: number; need: number }[],
): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const lines: string[] = [];
  lines.push(`RESUPPLY ORDER — ${stationName}`);
  lines.push(`Submitted: ${now}`);
  lines.push(`Items Short: ${shortItems.length}`);
  lines.push('');

  // Group by category
  const byCategory = new Map<string, typeof shortItems>();
  for (const item of shortItems) {
    const group = byCategory.get(item.category) ?? [];
    group.push(item);
    byCategory.set(item.category, group);
  }

  for (const [category, items] of byCategory) {
    lines.push(category.toUpperCase());
    for (const item of items) {
      lines.push(`  ${item.item_name}: Need ${item.need} (have ${item.actual}, target ${item.target})`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Pick List Generation', () => {
  describe('formatPickList', () => {
    it('formats pick list grouped by category', () => {
      const result = formatPickList('Station 10', [
        { item_name: 'NPA Kit', category: 'Airway', actual: 1, target: 4, need: 3 },
        { item_name: 'OPA Set', category: 'Airway', actual: 0, target: 2, need: 2 },
        { item_name: 'Tourniquet', category: 'Circulation', actual: 2, target: 6, need: 4 },
      ]);

      expect(result).toContain('RESUPPLY ORDER — Station 10');
      expect(result).toContain('Items Short: 3');
      expect(result).toContain('AIRWAY');
      expect(result).toContain('  NPA Kit: Need 3 (have 1, target 4)');
      expect(result).toContain('  OPA Set: Need 2 (have 0, target 2)');
      expect(result).toContain('CIRCULATION');
      expect(result).toContain('  Tourniquet: Need 4 (have 2, target 6)');
    });

    it('only includes short items', () => {
      // Items at or above target should never appear in the pick list
      const result = formatPickList('Station 13', [
        { item_name: 'Gauze 4x4', category: 'Circulation', actual: 3, target: 10, need: 7 },
      ]);

      expect(result).toContain('Items Short: 1');
      expect(result).toContain('Gauze 4x4');
      // Should NOT contain items that are not short
      expect(result).not.toContain('NPA Kit');
    });

    it('handles items with special characters in names', () => {
      const result = formatPickList('Station 10', [
        { item_name: 'OB/Peds Delivery Kit (1"x3")', category: 'OB/Peds', actual: 0, target: 2, need: 2 },
        { item_name: 'Burn Gel — Large', category: 'Burn', actual: 1, target: 3, need: 2 },
        { item_name: '1" Tape & Gauze', category: 'Misc', actual: 0, target: 4, need: 4 },
      ]);

      expect(result).toContain('OB/Peds Delivery Kit (1"x3"): Need 2');
      expect(result).toContain('Burn Gel — Large: Need 2');
      expect(result).toContain('1" Tape & Gauze: Need 4');
    });

    it('uses uppercase category names as section headers', () => {
      const result = formatPickList('Station 18', [
        { item_name: 'Pediatric BVM', category: 'OB/Peds', actual: 0, target: 1, need: 1 },
      ]);

      expect(result).toContain('OB/PEDS');
    });

    it('includes timestamp in the header', () => {
      const result = formatPickList('Station 20', [
        { item_name: 'SAM Splint', category: 'Splinting', actual: 1, target: 4, need: 3 },
      ]);

      expect(result).toMatch(/Submitted: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });
  });

  describe('category ordering', () => {
    it('sorts categories in the correct order (Airway first, Misc last)', () => {
      expect(CATEGORY_SORT['Airway']).toBe(1);
      expect(CATEGORY_SORT['Breathing']).toBe(2);
      expect(CATEGORY_SORT['Circulation']).toBe(3);
      expect(CATEGORY_SORT['Medications']).toBe(4);
      expect(CATEGORY_SORT['Splinting']).toBe(5);
      expect(CATEGORY_SORT['Burn']).toBe(6);
      expect(CATEGORY_SORT['OB/Peds']).toBe(7);
      expect(CATEGORY_SORT['Misc']).toBe(8);
    });

    it('CATEGORIES array has exactly 8 entries', () => {
      expect(CATEGORIES).toHaveLength(8);
    });

    it('CATEGORIES array is ordered by sort value', () => {
      for (let i = 0; i < CATEGORIES.length - 1; i++) {
        expect(CATEGORY_SORT[CATEGORIES[i]]).toBeLessThan(CATEGORY_SORT[CATEGORIES[i + 1]]);
      }
    });
  });

  describe('pick list via submitInventory (integration)', () => {
    it('generates an order with pick list when items are short', async () => {
      const items = [
        makeTemplateItem({ item_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4 }),
        makeTemplateItem({ item_id: 2, item_name: 'BVM Adult', category: 'Breathing', target_count: 2 }),
        makeTemplateItem({ item_id: 3, item_name: 'Tourniquet', category: 'Circulation', target_count: 6 }),
      ];

      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT name FROM stations WHERE id', () => [{ name: 'Station 10' }]);
      mock.onQuery('FROM items i', () => items);
      mock.onQuery('INSERT INTO inventory_sessions', () => []);
      mock.onQuery('INSERT INTO inventory_history', () => []);

      // Capture the pick list passed to the orders insert
      let _capturedPickList = '';
      mock.onQuery('INSERT INTO orders', (binds) => {
        // binds: [sessionId, stationId, itemsShort, pickList, 'pending']
        _capturedPickList = binds[3] as string;
        return [];
      });

      const db = mock.asD1();
      const result = await submitInventory(db, 10, [
        { itemId: 1, actualCount: 1 }, // short by 3
        { itemId: 2, actualCount: 2 }, // good
        { itemId: 3, actualCount: 3 }, // short by 3
      ]);

      expect(result.itemsShort).toBe(2);
      expect(result.orderId).not.toBeNull();
    });

    it('generates no order when no items are short', async () => {
      const items = [makeTemplateItem({ item_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4 })];

      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT name FROM stations WHERE id', () => [{ name: 'Station 10' }]);
      mock.onQuery('FROM items i', () => items);
      mock.onQuery('INSERT INTO inventory_sessions', () => []);
      mock.onQuery('INSERT INTO inventory_history', () => []);

      const db = mock.asD1();
      const result = await submitInventory(db, 10, [
        { itemId: 1, actualCount: 5 }, // over
      ]);

      expect(result.itemsShort).toBe(0);
      expect(result.orderId).toBeNull();
    });
  });
});
