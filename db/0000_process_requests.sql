CREATE TABLE process_requests (
 id TEXT PRIMARY KEY NOT NULL,
 created_at INTEGER NOT NULL,
 name TEXT NOT NULL,
 problem TEXT NOT NULL,
 dataset TEXT NOT NULL,
 expected TEXT NOT NULL,
 email TEXT
);
CREATE INDEX process_requests_created_at ON process_requests(created_at);
