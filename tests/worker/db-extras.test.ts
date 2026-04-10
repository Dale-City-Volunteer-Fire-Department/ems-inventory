import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { getConfig } from '../../src/worker/lib/db';

// ── Tests ────────────────────────────────────────────────────────────

describe('DB Extra Functions', () => {
  describe('getConfig', () => {
    it('returns config value for existing key', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT value FROM config WHERE key', () => [{ value: 'some-secret-value' }]);

      const db = mock.asD1();
      const result = await getConfig(db, 'station_pin');
      expect(result).toBe('some-secret-value');
    });

    it('returns null for non-existent key', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT value FROM config WHERE key', () => []);

      const db = mock.asD1();
      const result = await getConfig(db, 'nonexistent_key');
      expect(result).toBeNull();
    });
  });
});
