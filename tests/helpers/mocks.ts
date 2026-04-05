/**
 * Test helpers — D1 and KV mocks for vitest
 *
 * These mocks simulate the Cloudflare D1 and KV interfaces
 * using in-memory data structures, suitable for unit-testing
 * business logic without a real database.
 */

import type { Env } from '../../src/worker/types';

// ── D1 Mock ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface PreparedStatementState {
  sql: string;
  binds: unknown[];
}

/**
 * Minimal D1Database mock backed by a rows array.
 * For tests that need actual SQL execution, use the createTestDb() helper
 * which sets up real rows. For simpler unit tests, the mock tracks calls.
 */
export function createMockD1(rows: Row[] = []): D1Database {
  let lastRowId = rows.length;
  const _batchResults: Row[][] = [];

  const createStatement = (sql: string): D1PreparedStatement => {
    const state: PreparedStatementState = { sql, binds: [] };

    const stmt: D1PreparedStatement = {
      bind(...args: unknown[]) {
        state.binds = args;
        return stmt;
      },
      async first<T>(column?: string): Promise<T | null> {
        if (rows.length === 0) return null;
        if (column) {
          return (rows[0] as Record<string, unknown>)[column] as T;
        }
        return rows[0] as T;
      },
      async all<T>(): Promise<D1Result<T>> {
        return {
          results: rows as T[],
          success: true,
          meta: {
            duration: 0,
            last_row_id: lastRowId,
            changes: 0,
            served_by: 'mock',
            internal_stats: null,
            rows_read: rows.length,
            rows_written: 0,
            changed_db: false,
            size_after: 0,
          },
        };
      },
      async run(): Promise<D1Result<unknown>> {
        lastRowId++;
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            last_row_id: lastRowId,
            changes: 1,
            served_by: 'mock',
            internal_stats: null,
            rows_read: 0,
            rows_written: 1,
            changed_db: true,
            size_after: 0,
          },
        };
      },
      async raw<T>(): Promise<T[]> {
        return rows as T[];
      },
    };

    return stmt;
  };

  return {
    prepare(sql: string) {
      return createStatement(sql);
    },
    async batch(stmts: D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
      const results: D1Result<unknown>[] = [];
      for (const _stmt of stmts) {
        lastRowId++;
        results.push({
          results: [],
          success: true,
          meta: {
            duration: 0,
            last_row_id: lastRowId,
            changes: 1,
            served_by: 'mock',
            internal_stats: null,
            rows_read: 0,
            rows_written: 1,
            changed_db: true,
            size_after: 0,
          },
        });
      }
      return results;
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
    async exec(_sql: string): Promise<D1ExecResult> {
      return { count: 0, duration: 0 };
    },
  } as D1Database;
}

// ── Stateful D1 Mock (SQL-aware) ─────────────────────────────────────

/**
 * A more sophisticated D1 mock that tracks calls and allows per-query
 * response configuration. Use `onQuery()` to set up expected responses.
 */
export class StatefulD1Mock {
  private queryHandlers: Map<string, (binds: unknown[]) => Row[]> = new Map();
  private lastRowId = 0;
  private batchCalls: D1PreparedStatement[] = [];

  /** Register a handler for queries matching a SQL pattern (substring match) */
  onQuery(sqlPattern: string, handler: (binds: unknown[]) => Row[]): this {
    this.queryHandlers.set(sqlPattern, handler);
    return this;
  }

  private findHandler(sql: string): ((binds: unknown[]) => Row[]) | undefined {
    for (const [pattern, handler] of this.queryHandlers) {
      if (sql.includes(pattern)) return handler;
    }
    return undefined;
  }

  asD1(): D1Database {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const createStatement = (sql: string): D1PreparedStatement => {
      let binds: unknown[] = [];

      const stmt: D1PreparedStatement = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async first<T>(column?: string): Promise<T | null> {
          const handler = self.findHandler(sql);
          const rows = handler ? handler(binds) : [];
          if (rows.length === 0) return null;
          if (column) return (rows[0] as Record<string, unknown>)[column] as T;
          return rows[0] as T;
        },
        async all<T>(): Promise<D1Result<T>> {
          const handler = self.findHandler(sql);
          const rows = handler ? handler(binds) : [];
          return {
            results: rows as T[],
            success: true,
            meta: {
              duration: 0,
              last_row_id: self.lastRowId,
              changes: 0,
              served_by: 'mock',
              internal_stats: null,
              rows_read: rows.length,
              rows_written: 0,
              changed_db: false,
              size_after: 0,
            },
          };
        },
        async run(): Promise<D1Result<unknown>> {
          self.lastRowId++;
          const handler = self.findHandler(sql);
          if (handler) handler(binds);
          return {
            results: [],
            success: true,
            meta: {
              duration: 0,
              last_row_id: self.lastRowId,
              changes: 1,
              served_by: 'mock',
              internal_stats: null,
              rows_read: 0,
              rows_written: 1,
              changed_db: true,
              size_after: 0,
            },
          };
        },
        async raw<T>(): Promise<T[]> {
          const handler = self.findHandler(sql);
          const rows = handler ? handler(binds) : [];
          return rows as T[];
        },
      };

      return stmt;
    };

    return {
      prepare(sql: string) {
        return createStatement(sql);
      },
      async batch(stmts: D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
        self.batchCalls.push(...stmts);
        const results: D1Result<unknown>[] = [];
        for (const _stmt of stmts) {
          self.lastRowId++;
          results.push({
            results: [],
            success: true,
            meta: {
              duration: 0,
              last_row_id: self.lastRowId,
              changes: 1,
              served_by: 'mock',
              internal_stats: null,
              rows_read: 0,
              rows_written: 1,
              changed_db: true,
              size_after: 0,
            },
          });
        }
        return results;
      },
      async dump(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      },
      async exec(_sql: string): Promise<D1ExecResult> {
        return { count: 0, duration: 0 };
      },
    } as D1Database;
  }
}

// ── KV Mock ──────────────────────────────────────────────────────────

export function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiration?: number }>();

  return {
    async get(key: string, _typeOrOptions?: unknown): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      // Check expiration
      if (entry.expiration && Date.now() / 1000 > entry.expiration) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void> {
      const expiration =
        options?.expiration ?? (options?.expirationTtl ? Date.now() / 1000 + options.expirationTtl : undefined);
      store.set(key, { value, expiration });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list(_options?: unknown): Promise<KVNamespaceListResult<unknown, string>> {
      const keys = Array.from(store.keys()).map((name) => ({ name, expiration: undefined, metadata: undefined }));
      return { keys, list_complete: true, cacheStatus: null } as unknown as KVNamespaceListResult<unknown, string>;
    },
    async getWithMetadata(_key: string): Promise<KVNamespaceGetWithMetadataResult<string, unknown>> {
      return { value: null, metadata: null, cacheStatus: null };
    },
  } as unknown as KVNamespace;
}

// ── Env Factory ──────────────────────────────────────────────────────

export function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    DB: createMockD1(),
    SESSIONS: createMockKV(),
    APP_NAME: 'ems-inventory-test',
    ORG_NAME: 'DCVFD',
    AZURE_AD_CLIENT_ID: 'test-client-id',
    AZURE_AD_TENANT_ID: 'test-tenant-id',
    STATION_PIN: '5214',
    MAGIC_LINK_SECRET: 'test-magic-link-secret-key-for-testing',
    ...overrides,
  };
}

// ── Test Data Factories ──────────────────────────────────────────────

export function makeTemplateItem(
  overrides: Partial<{
    item_id: number;
    item_name: string;
    category: string;
    sort_order: number;
    target_count: number;
  }> = {},
) {
  return {
    item_id: overrides.item_id ?? 1,
    item_name: overrides.item_name ?? 'NPA Kit',
    category: overrides.category ?? 'Airway',
    sort_order: overrides.sort_order ?? 0,
    target_count: overrides.target_count ?? 4,
  };
}

export function makeItem(
  overrides: Partial<{
    id: number;
    name: string;
    category: string;
    sort_order: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? 'NPA Kit',
    category: overrides.category ?? 'Airway',
    sort_order: overrides.sort_order ?? 0,
    is_active: overrides.is_active ?? 1,
    created_at: overrides.created_at ?? '2026-01-01 00:00:00',
    updated_at: overrides.updated_at ?? '2026-01-01 00:00:00',
  };
}
