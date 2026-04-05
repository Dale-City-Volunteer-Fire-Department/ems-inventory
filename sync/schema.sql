-- ============================================================
-- Azure SQL Schema for ems_inventory database
-- Mirrors D1 schema in T-SQL syntax
-- Replaces SkyVia replication
-- ============================================================

-- ============================================================
-- 1. items — Master supply catalog
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'items')
CREATE TABLE items (
  id            INT             NOT NULL PRIMARY KEY,
  name          NVARCHAR(500)   NOT NULL UNIQUE,
  category      NVARCHAR(50)    NOT NULL,
  sort_order    INT             NOT NULL DEFAULT 0,
  is_active     INT             NOT NULL DEFAULT 1,
  created_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
-- 2. stations — Fire stations
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'stations')
CREATE TABLE stations (
  id            INT             NOT NULL PRIMARY KEY,
  name          NVARCHAR(200)   NOT NULL UNIQUE,
  code          NVARCHAR(20)    NOT NULL UNIQUE,
  is_active     INT             NOT NULL DEFAULT 1
);
GO

-- ============================================================
-- 3. stock_targets — PAR levels per item per station
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'stock_targets')
CREATE TABLE stock_targets (
  id            INT             NOT NULL PRIMARY KEY,
  item_id       INT             NOT NULL REFERENCES items(id),
  station_id    INT             NOT NULL REFERENCES stations(id),
  target_count  INT             NOT NULL DEFAULT 0,
  updated_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_stock_targets_item_station UNIQUE (item_id, station_id)
);
GO

-- ============================================================
-- 4. inventory_sessions — Groups a submission
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'inventory_sessions')
CREATE TABLE inventory_sessions (
  id            INT             NOT NULL PRIMARY KEY,
  station_id    INT             NOT NULL REFERENCES stations(id),
  submitted_by  NVARCHAR(500)   NULL,
  submitted_at  DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  item_count    INT             NOT NULL DEFAULT 0,
  items_short   INT             NOT NULL DEFAULT 0
);
GO

-- ============================================================
-- 5. inventory_history — Permanent archive
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'inventory_history')
CREATE TABLE inventory_history (
  id            INT             NOT NULL PRIMARY KEY,
  session_id    INT             NOT NULL REFERENCES inventory_sessions(id),
  item_name     NVARCHAR(500)   NOT NULL,
  category      NVARCHAR(50)    NOT NULL,
  station_name  NVARCHAR(200)   NOT NULL,
  target_count  INT             NOT NULL,
  actual_count  INT             NOT NULL,
  delta         INT             NOT NULL,
  status        NVARCHAR(50)    NOT NULL
);
GO

-- ============================================================
-- 6. orders — Resupply pick lists
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'orders')
CREATE TABLE orders (
  id            INT             NOT NULL PRIMARY KEY,
  session_id    INT             NOT NULL REFERENCES inventory_sessions(id),
  station_id    INT             NOT NULL REFERENCES stations(id),
  items_short   INT             NOT NULL DEFAULT 0,
  pick_list     NVARCHAR(MAX)   NOT NULL,
  status        NVARCHAR(50)    NOT NULL DEFAULT 'pending',
  created_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  filled_at     DATETIME2       NULL,
  filled_by     NVARCHAR(500)   NULL
);
GO

-- ============================================================
-- 7. users — User accounts
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
CREATE TABLE users (
  id            INT             NOT NULL PRIMARY KEY,
  email         NVARCHAR(500)   NULL UNIQUE,
  name          NVARCHAR(500)   NOT NULL,
  role          NVARCHAR(50)    NOT NULL DEFAULT 'crew',
  auth_method   NVARCHAR(50)    NOT NULL,
  station_id    INT             NULL REFERENCES stations(id),
  is_active     INT             NOT NULL DEFAULT 1,
  created_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  last_login_at DATETIME2       NULL
);
GO

-- ============================================================
-- 8. config — Runtime config key-value store
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'config')
CREATE TABLE config (
  [key]         NVARCHAR(200)   NOT NULL PRIMARY KEY,
  value         NVARCHAR(MAX)   NOT NULL,
  updated_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
-- 9. sync_metadata — Tracks last sync timestamps per table
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_metadata')
CREATE TABLE sync_metadata (
  table_name    NVARCHAR(100)   NOT NULL PRIMARY KEY,
  last_synced_at DATETIME2      NOT NULL DEFAULT '1970-01-01',
  rows_synced   INT             NOT NULL DEFAULT 0,
  updated_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
-- Indexes
-- ============================================================
CREATE NONCLUSTERED INDEX idx_stock_targets_item_id    ON stock_targets(item_id);
CREATE NONCLUSTERED INDEX idx_stock_targets_station_id ON stock_targets(station_id);
CREATE NONCLUSTERED INDEX idx_inventory_sessions_station_id   ON inventory_sessions(station_id);
CREATE NONCLUSTERED INDEX idx_inventory_sessions_submitted_at ON inventory_sessions(submitted_at);
CREATE NONCLUSTERED INDEX idx_inventory_history_session_id   ON inventory_history(session_id);
CREATE NONCLUSTERED INDEX idx_inventory_history_station_name ON inventory_history(station_name);
CREATE NONCLUSTERED INDEX idx_orders_session_id ON orders(session_id);
CREATE NONCLUSTERED INDEX idx_orders_station_id ON orders(station_id);
CREATE NONCLUSTERED INDEX idx_orders_status     ON orders(status);
CREATE NONCLUSTERED INDEX idx_users_station_id ON users(station_id);
CREATE NONCLUSTERED INDEX idx_users_role       ON users(role);
CREATE NONCLUSTERED INDEX idx_users_is_active  ON users(is_active);
CREATE NONCLUSTERED INDEX idx_items_category   ON items(category);
CREATE NONCLUSTERED INDEX idx_items_is_active  ON items(is_active);
GO

-- ============================================================
-- Seed sync_metadata with table names
-- ============================================================
INSERT INTO sync_metadata (table_name) VALUES ('items');
INSERT INTO sync_metadata (table_name) VALUES ('stations');
INSERT INTO sync_metadata (table_name) VALUES ('stock_targets');
INSERT INTO sync_metadata (table_name) VALUES ('inventory_sessions');
INSERT INTO sync_metadata (table_name) VALUES ('inventory_history');
INSERT INTO sync_metadata (table_name) VALUES ('orders');
INSERT INTO sync_metadata (table_name) VALUES ('users');
INSERT INTO sync_metadata (table_name) VALUES ('config');
GO
