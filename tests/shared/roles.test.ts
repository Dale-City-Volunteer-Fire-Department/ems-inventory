import { describe, it, expect } from 'vitest';
import { ROLES } from '../../src/shared/roles';
import type { UserRole } from '../../src/shared/types';

// ── Tests ────────────────────────────────────────────────────────────

describe('Shared Roles', () => {
  describe('ROLES constant', () => {
    it('has exactly 3 roles: crew, logistics, admin', () => {
      const roleKeys = Object.keys(ROLES);
      expect(roleKeys).toHaveLength(3);
      expect(roleKeys).toContain('crew');
      expect(roleKeys).toContain('logistics');
      expect(roleKeys).toContain('admin');
    });

    it('each role has a label and description', () => {
      for (const role of Object.values(ROLES)) {
        expect(role.label).toBeDefined();
        expect(typeof role.label).toBe('string');
        expect(role.label.length).toBeGreaterThan(0);
        expect(role.description).toBeDefined();
        expect(typeof role.description).toBe('string');
        expect(role.description.length).toBeGreaterThan(0);
      }
    });

    it('crew label is "Station Crew"', () => {
      expect(ROLES.crew.label).toBe('Station Crew');
    });

    it('logistics label is "Logistics"', () => {
      expect(ROLES.logistics.label).toBe('Logistics');
    });

    it('admin label is "Admin"', () => {
      expect(ROLES.admin.label).toBe('Admin');
    });

    it('crew description mentions inventory counts', () => {
      expect(ROLES.crew.description.toLowerCase()).toContain('inventory');
    });

    it('logistics description mentions shortages or pick lists', () => {
      const desc = ROLES.logistics.description.toLowerCase();
      expect(desc.includes('shortage') || desc.includes('pick list')).toBe(true);
    });

    it('admin description mentions manage', () => {
      expect(ROLES.admin.description.toLowerCase()).toContain('manage');
    });
  });
});
