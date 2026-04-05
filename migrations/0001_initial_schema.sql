-- 0001_initial_schema.sql
-- EMS Inventory — Initial D1 schema
-- Tables: items, stations, stock_targets, inventory_sessions,
--         inventory_history, orders, users, config

-- ============================================================
-- 1. items — Master supply catalog (~228 items)
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  category    TEXT    NOT NULL CHECK(category IN ('Airway','Breathing','Circulation','Medications','Splinting','Burn','OB/Peds','Misc')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. stations — 4 fire stations
-- ============================================================
CREATE TABLE IF NOT EXISTS stations (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL UNIQUE,
  code      TEXT    NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- 3. stock_targets — PAR levels per item per station (~912 records)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_targets (
  id            INTEGER PRIMARY KEY,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  station_id    INTEGER NOT NULL REFERENCES stations(id),
  target_count  INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, station_id)
);

-- ============================================================
-- 4. inventory_sessions — Groups a submission (one per station per submit)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_sessions (
  id            INTEGER PRIMARY KEY,
  station_id    INTEGER NOT NULL REFERENCES stations(id),
  submitted_by  TEXT,
  submitted_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  item_count    INTEGER NOT NULL DEFAULT 0,
  items_short   INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 5. inventory_history — Permanent archive (plain text snapshots)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_history (
  id            INTEGER PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES inventory_sessions(id),
  item_name     TEXT    NOT NULL,
  category      TEXT    NOT NULL,
  station_name  TEXT    NOT NULL,
  target_count  INTEGER NOT NULL,
  actual_count  INTEGER NOT NULL,
  delta         INTEGER NOT NULL,
  status        TEXT    NOT NULL
);

-- ============================================================
-- 6. orders — Resupply pick lists
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES inventory_sessions(id),
  station_id  INTEGER NOT NULL REFERENCES stations(id),
  items_short INTEGER NOT NULL DEFAULT 0,
  pick_list   TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','filled')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  filled_at   TEXT,
  filled_by   TEXT
);

-- ============================================================
-- 7. users — User accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    UNIQUE,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'crew' CHECK(role IN ('crew','logistics','admin')),
  auth_method   TEXT    NOT NULL CHECK(auth_method IN ('entra_sso','magic_link','pin')),
  station_id    INTEGER REFERENCES stations(id),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ============================================================
-- 8. config — Runtime config key-value store
-- ============================================================
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes — foreign keys and common query patterns
-- ============================================================

-- stock_targets
CREATE INDEX IF NOT EXISTS idx_stock_targets_item_id    ON stock_targets(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_targets_station_id ON stock_targets(station_id);

-- inventory_sessions
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_station_id   ON inventory_sessions(station_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_submitted_at ON inventory_sessions(submitted_at);

-- inventory_history
CREATE INDEX IF NOT EXISTS idx_inventory_history_session_id   ON inventory_history(session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_history_station_name ON inventory_history(station_name);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_station_id ON orders(station_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);

-- users
CREATE INDEX IF NOT EXISTS idx_users_station_id ON users(station_id);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active  ON users(is_active);

-- items
CREATE INDEX IF NOT EXISTS idx_items_category  ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_is_active ON items(is_active);

-- ============================================================
-- Seed data — stations
-- ============================================================
INSERT INTO stations (id, name, code) VALUES (10, 'Station 10', 'FS10') ON CONFLICT(id) DO NOTHING;
INSERT INTO stations (id, name, code) VALUES (13, 'Station 13', 'FS13') ON CONFLICT(id) DO NOTHING;
INSERT INTO stations (id, name, code) VALUES (18, 'Station 18', 'FS18') ON CONFLICT(id) DO NOTHING;
INSERT INTO stations (id, name, code) VALUES (20, 'Station 20', 'FS20') ON CONFLICT(id) DO NOTHING;

-- ============================================================
-- Seed data — config
-- ============================================================
INSERT INTO config (key, value) VALUES ('station_pin', '5214') ON CONFLICT(key) DO NOTHING;
INSERT INTO config (key, value) VALUES ('app_version', '1.0.0') ON CONFLICT(key) DO NOTHING;
