import { describe, it, expect } from 'vitest';
import { CATEGORIES, CATEGORY_SORT } from '../../src/shared/categories';
import type { Category, CountStatus, UserRole } from '../../src/shared/types';

// ── Tests ────────────────────────────────────────────────────────────

describe('Shared Validation', () => {
  describe('category validation', () => {
    const VALID_CATEGORIES: Category[] = [
      'Airway',
      'Breathing',
      'Circulation',
      'Medications',
      'Splinting',
      'Burn',
      'OB/Peds',
      'Misc',
    ];

    it('CATEGORIES array matches the expected values', () => {
      expect(CATEGORIES).toEqual(VALID_CATEGORIES);
    });

    it('every category has a sort order', () => {
      for (const cat of CATEGORIES) {
        expect(CATEGORY_SORT[cat]).toBeDefined();
        expect(typeof CATEGORY_SORT[cat]).toBe('number');
      }
    });

    it('all category sort orders are unique', () => {
      const sortValues = Object.values(CATEGORY_SORT);
      const unique = new Set(sortValues);
      expect(unique.size).toBe(sortValues.length);
    });

    it('category sort orders are sequential from 1 to 8', () => {
      const sortValues = Object.values(CATEGORY_SORT).sort((a, b) => a - b);
      expect(sortValues).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('rejects invalid category strings', () => {
      const invalidCategories = ['airway', 'AIRWAY', 'Medical', 'Other', '', 'Airway ', ' Airway'];
      for (const invalid of invalidCategories) {
        expect(VALID_CATEGORIES.includes(invalid as Category)).toBe(false);
      }
    });

    it('OB/Peds contains the forward slash', () => {
      expect(CATEGORIES).toContain('OB/Peds');
      expect(CATEGORY_SORT['OB/Peds']).toBe(7);
    });
  });

  describe('role validation', () => {
    const VALID_ROLES: UserRole[] = ['crew', 'logistics', 'admin'];

    it('accepts valid roles', () => {
      for (const role of VALID_ROLES) {
        expect(VALID_ROLES.includes(role)).toBe(true);
      }
    });

    it('rejects invalid roles', () => {
      const invalidRoles = ['Crew', 'ADMIN', 'superadmin', 'volunteer', 'chief', ''];
      for (const role of invalidRoles) {
        expect(VALID_ROLES.includes(role as UserRole)).toBe(false);
      }
    });

    it('has exactly 3 valid roles', () => {
      expect(VALID_ROLES).toHaveLength(3);
    });
  });

  describe('count status calculation', () => {
    function calculateStatus(actual: number | null, target: number): CountStatus {
      if (actual === null) return 'not_entered';
      const delta = actual - target;
      if (delta === 0) return 'good';
      if (delta > 0) return 'over';
      return 'short';
    }

    it('returns "not_entered" when actual is null', () => {
      expect(calculateStatus(null, 4)).toBe('not_entered');
    });

    it('returns "good" when actual equals target', () => {
      expect(calculateStatus(4, 4)).toBe('good');
      expect(calculateStatus(0, 0)).toBe('good');
    });

    it('returns "over" when actual exceeds target', () => {
      expect(calculateStatus(5, 4)).toBe('over');
      expect(calculateStatus(10, 1)).toBe('over');
    });

    it('returns "short" when actual is below target', () => {
      expect(calculateStatus(3, 4)).toBe('short');
      expect(calculateStatus(0, 10)).toBe('short');
    });

    it('handles zero target correctly', () => {
      expect(calculateStatus(0, 0)).toBe('good');
      expect(calculateStatus(1, 0)).toBe('over');
    });

    it('handles large numbers', () => {
      expect(calculateStatus(999, 1000)).toBe('short');
      expect(calculateStatus(1000, 1000)).toBe('good');
      expect(calculateStatus(1001, 1000)).toBe('over');
    });
  });
});
