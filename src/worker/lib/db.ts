// D1 database helpers

import type { Item, Station, StockTarget, InventoryHistory, Order, Category, OrderStatus } from '@shared/types';

// ── Items ───────────────────────────────────────────────────────────

export async function getItems(db: D1Database, activeOnly = true): Promise<Item[]> {
  const sql = activeOnly
    ? 'SELECT * FROM items WHERE is_active = 1 ORDER BY category, sort_order, name'
    : 'SELECT * FROM items ORDER BY category, sort_order, name';
  const result = await db.prepare(sql).all<Item>();
  return result.results;
}

export async function upsertItem(
  db: D1Database,
  item: { id?: number; name: string; category: Category; sort_order?: number; is_active?: boolean },
): Promise<Item> {
  if (item.id) {
    await db
      .prepare(
        `UPDATE items SET name = ?, category = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(item.name, item.category, item.sort_order ?? 0, item.is_active !== false ? 1 : 0, item.id)
      .run();
    const row = await db.prepare('SELECT * FROM items WHERE id = ?').bind(item.id).first<Item>();
    return row!;
  } else {
    const result = await db
      .prepare('INSERT INTO items (name, category, sort_order, is_active) VALUES (?, ?, ?, ?)')
      .bind(item.name, item.category, item.sort_order ?? 0, item.is_active !== false ? 1 : 0)
      .run();
    const row = await db.prepare('SELECT * FROM items WHERE id = ?').bind(result.meta.last_row_id).first<Item>();
    return row!;
  }
}

// ── Stations ────────────────────────────────────────────────────────

export async function getStations(db: D1Database): Promise<Station[]> {
  const result = await db.prepare('SELECT * FROM stations WHERE is_active = 1 ORDER BY id').all<Station>();
  return result.results;
}

// ── Stock Targets ───────────────────────────────────────────────────

interface StockTargetWithItem extends StockTarget {
  item_name: string;
  category: string;
}

export async function getStockTargets(db: D1Database, stationId: number): Promise<StockTargetWithItem[]> {
  const result = await db
    .prepare(
      `SELECT st.*, i.name AS item_name, i.category
       FROM stock_targets st
       JOIN items i ON i.id = st.item_id
       WHERE st.station_id = ? AND i.is_active = 1
       ORDER BY i.category, i.sort_order, i.name`,
    )
    .bind(stationId)
    .all<StockTargetWithItem>();
  return result.results;
}

export async function updateStockTarget(
  db: D1Database,
  itemId: number,
  stationId: number,
  targetCount: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stock_targets (item_id, station_id, target_count)
       VALUES (?, ?, ?)
       ON CONFLICT(item_id, station_id) DO UPDATE SET target_count = ?, updated_at = datetime('now')`,
    )
    .bind(itemId, stationId, targetCount, targetCount)
    .run();
}

// ── Inventory Template ──────────────────────────────────────────────

export interface TemplateItem {
  item_id: number;
  item_name: string;
  category: Category;
  sort_order: number;
  target_count: number;
}

export async function getInventoryTemplate(db: D1Database, stationId: number): Promise<TemplateItem[]> {
  const result = await db
    .prepare(
      `SELECT i.id AS item_id, i.name AS item_name, i.category, i.sort_order,
              COALESCE(st.target_count, 0) AS target_count
       FROM items i
       LEFT JOIN stock_targets st ON st.item_id = i.id AND st.station_id = ?
       WHERE i.is_active = 1
       ORDER BY i.category, i.sort_order, i.name`,
    )
    .bind(stationId)
    .all<TemplateItem>();
  return result.results;
}

// ── Submit Inventory ────────────────────────────────────────────────

interface CountEntry {
  itemId: number;
  actualCount: number;
}

interface SubmitResult {
  sessionId: number;
  itemCount: number;
  itemsShort: number;
  orderId: number | null;
}

export async function submitInventory(
  db: D1Database,
  stationId: number,
  counts: CountEntry[],
  submittedBy?: string,
): Promise<SubmitResult> {
  // Get station name for snapshots
  const station = await db.prepare('SELECT name FROM stations WHERE id = ?').bind(stationId).first<{ name: string }>();
  if (!station) throw new Error(`Station ${stationId} not found`);

  // Get all active items with their targets for this station
  const template = await getInventoryTemplate(db, stationId);

  // Build a lookup of submitted counts by item_id
  const countMap = new Map<number, number>();
  for (const c of counts) {
    countMap.set(c.itemId, c.actualCount);
  }

  // Only process items that have counts — partial submissions are allowed
  const enteredItems = template.filter((t) => countMap.has(t.item_id));
  if (enteredItems.length === 0) {
    throw new Error('At least one item count is required');
  }

  // Calculate shortages from entered items
  let itemsShort = 0;
  const shortItems: { item_name: string; category: string; actual: number; target: number; need: number }[] = [];

  for (const t of enteredItems) {
    const actual = countMap.get(t.item_id)!;
    const delta = actual - t.target_count;
    if (delta < 0) {
      itemsShort++;
      shortItems.push({
        item_name: t.item_name,
        category: t.category,
        actual,
        target: t.target_count,
        need: Math.abs(delta),
      });
    }
  }

  const sessionResult = await db
    .prepare('INSERT INTO inventory_sessions (station_id, submitted_by, item_count, items_short) VALUES (?, ?, ?, ?)')
    .bind(stationId, submittedBy ?? null, enteredItems.length, itemsShort)
    .run();

  const sessionId = sessionResult.meta.last_row_id as number;

  // Insert history records
  const historyStmt = db.prepare(
    `INSERT INTO inventory_history (session_id, item_name, category, station_name, target_count, actual_count, delta, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const batch: D1PreparedStatement[] = [];
  for (const t of enteredItems) {
    const actual = countMap.get(t.item_id)!;
    const delta = actual - t.target_count;
    let status: string;
    if (delta === 0) status = 'good';
    else if (delta > 0) status = 'over';
    else status = 'short';

    batch.push(
      historyStmt.bind(sessionId, t.item_name, t.category, station.name, t.target_count, actual, delta, status),
    );
  }
  await db.batch(batch);

  // Auto-generate order if there are shortages
  let orderId: number | null = null;
  if (shortItems.length > 0) {
    const pickList = formatPickList(station.name, shortItems);
    const orderResult = await db
      .prepare('INSERT INTO orders (session_id, station_id, items_short, pick_list, status) VALUES (?, ?, ?, ?, ?)')
      .bind(sessionId, stationId, itemsShort, pickList, 'pending')
      .run();
    orderId = orderResult.meta.last_row_id as number;
  }

  return { sessionId, itemCount: enteredItems.length, itemsShort, orderId };
}

export function formatPickList(
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

// ── Sessions ────────────────────────────────────────────────────────

interface SessionFilters {
  stationId?: number;
  limit?: number;
  offset?: number;
}

export interface InventorySession {
  id: number;
  station_id: number;
  station_name: string;
  submitted_by: string | null;
  submitted_at: string;
  item_count: number;
  items_short: number;
}

export async function getSessions(db: D1Database, filters?: SessionFilters): Promise<InventorySession[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (filters?.stationId) {
    conditions.push('s.station_id = ?');
    binds.push(filters.stationId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;

  const sql = `SELECT s.*, st.name AS station_name
               FROM inventory_sessions s
               JOIN stations st ON st.id = s.station_id
               ${where}
               ORDER BY s.submitted_at DESC
               LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<InventorySession>();
  return result.results;
}

// ── History ─────────────────────────────────────────────────────────

interface HistoryFilters {
  stationName?: string;
  sessionId?: number;
  category?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function getHistory(db: D1Database, filters?: HistoryFilters): Promise<InventoryHistory[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (filters?.stationName) {
    conditions.push('h.station_name = ?');
    binds.push(filters.stationName);
  }
  if (filters?.sessionId) {
    conditions.push('h.session_id = ?');
    binds.push(filters.sessionId);
  }
  if (filters?.category) {
    conditions.push('h.category = ?');
    binds.push(filters.category);
  }
  if (filters?.status) {
    conditions.push('h.status = ?');
    binds.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 500;
  const offset = filters?.offset ?? 0;

  const sql = `SELECT h.*, s.submitted_at, s.submitted_by
               FROM inventory_history h
               JOIN inventory_sessions s ON s.id = h.session_id
               ${where}
               ORDER BY s.submitted_at DESC, h.category, h.item_name
               LIMIT ? OFFSET ?`;

  const stmt = db.prepare(sql);
  binds.push(limit, offset);
  const result = await stmt.bind(...binds).all<InventoryHistory>();
  return result.results;
}

// ── Orders ──────────────────────────────────────────────────────────

interface OrderFilters {
  stationId?: number;
  status?: OrderStatus;
  limit?: number;
  offset?: number;
}

export async function getOrders(db: D1Database, filters?: OrderFilters): Promise<Order[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (filters?.stationId) {
    conditions.push('station_id = ?');
    binds.push(filters.stationId);
  }
  if (filters?.status) {
    conditions.push('status = ?');
    binds.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;

  const sql = `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Order>();
  return result.results;
}

export async function updateOrderStatus(
  db: D1Database,
  orderId: number,
  status: OrderStatus,
  filledBy?: string,
): Promise<void> {
  if (status === 'filled') {
    await db
      .prepare(`UPDATE orders SET status = ?, filled_at = datetime('now'), filled_by = ? WHERE id = ?`)
      .bind(status, filledBy ?? null, orderId)
      .run();
  } else {
    await db.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(status, orderId).run();
  }
}

// ── Config ──────────────────────────────────────────────────────────

export async function getConfig(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM config WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
