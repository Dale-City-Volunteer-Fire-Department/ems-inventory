-- 0003_public_inventory_notes_attachments.sql
-- Add columns to support public inventory submissions with notes and image attachments.

-- 1. notes — Optional free-text notes/comments from the submitter
ALTER TABLE inventory_sessions ADD COLUMN notes TEXT;

-- 2. is_public — Boolean flag (0/1) to distinguish public form submissions from internal ones
ALTER TABLE inventory_sessions ADD COLUMN is_public INTEGER DEFAULT 0;

-- 3. submitter_name — For public submissions where there is no authenticated user
ALTER TABLE inventory_sessions ADD COLUMN submitter_name TEXT;

-- 4. inventory_attachments — File attachments stored in R2, linked to sessions
CREATE TABLE inventory_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER,
  uploaded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES inventory_sessions(id)
);

-- 5. Index on attachments for session lookups
CREATE INDEX idx_attachments_session ON inventory_attachments(session_id);
