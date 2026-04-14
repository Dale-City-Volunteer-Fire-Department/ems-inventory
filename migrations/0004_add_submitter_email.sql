-- 0004_add_submitter_email.sql
-- Add submitter_email column to inventory_sessions for magic link authenticated public submissions.
-- Stores the email address of a public submitter who authenticated via magic link.
-- NULL for PIN-gated submissions and authenticated Entra SSO sessions.

ALTER TABLE inventory_sessions ADD COLUMN submitter_email TEXT;
