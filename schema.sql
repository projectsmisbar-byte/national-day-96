-- Cloudflare D1 schema for "مسابقة اليوم الوطني 96"
-- Apply once with: wrangler d1 execute national-day-96-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_uid     TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT NOT NULL,
  path          TEXT NOT NULL,
  description   TEXT NOT NULL,
  file_key      TEXT,          -- object key in R2, if a file was uploaded
  file_name     TEXT,          -- original filename
  file_type     TEXT,          -- MIME type
  submitted_at  TEXT NOT NULL, -- ISO 8601
  ip_hash       TEXT           -- lightweight anti-abuse signal (not raw IP)
);

CREATE INDEX IF NOT EXISTS idx_entries_email ON entries(email);
CREATE INDEX IF NOT EXISTS idx_entries_submitted_at ON entries(submitted_at);
