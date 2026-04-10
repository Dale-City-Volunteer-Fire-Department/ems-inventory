-- 0002_add_users_updated_at.sql
-- Add missing updated_at column to users table
-- Note: ALTER TABLE requires a constant default; the worker sets datetime('now') on UPDATE.
ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT '2026-01-01T00:00:00';
