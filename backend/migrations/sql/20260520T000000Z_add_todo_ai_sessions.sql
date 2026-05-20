CREATE TABLE IF NOT EXISTS "todo_ai_sessions" (
  "id" varchar PRIMARY KEY NOT NULL,
  "todo_id" varchar NOT NULL,
  "session_key" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT ('active'),
  "last_message_at" datetime,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "fk_todo_ai_sessions_todo_id" FOREIGN KEY ("todo_id") REFERENCES "todos" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_todo_ai_sessions_todo_id" ON "todo_ai_sessions" ("todo_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_todo_ai_sessions_session_key" ON "todo_ai_sessions" ("session_key");

CREATE TABLE IF NOT EXISTS "todo_ai_messages" (
  "id" varchar PRIMARY KEY NOT NULL,
  "session_id" varchar NOT NULL,
  "todo_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "role" varchar NOT NULL,
  "content" text NOT NULL,
  "openclaw_dispatch_id" varchar,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "fk_todo_ai_messages_session_id" FOREIGN KEY ("session_id") REFERENCES "todo_ai_sessions" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_todo_ai_messages_todo_id" FOREIGN KEY ("todo_id") REFERENCES "todos" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_todo_ai_messages_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_todo_ai_messages_session_created_at" ON "todo_ai_messages" ("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_todo_ai_messages_todo_created_at" ON "todo_ai_messages" ("todo_id", "created_at");

CREATE TABLE IF NOT EXISTS "todo_ai_suggestions" (
  "id" varchar PRIMARY KEY NOT NULL,
  "session_id" varchar NOT NULL,
  "todo_id" varchar NOT NULL,
  "message_id" varchar NOT NULL,
  "created_by_user_id" varchar NOT NULL,
  "type" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT ('pending'),
  "content" text NOT NULL,
  "applied_by_user_id" varchar,
  "applied_progress_entry_id" varchar,
  "applied_at" datetime,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "fk_todo_ai_suggestions_session_id" FOREIGN KEY ("session_id") REFERENCES "todo_ai_sessions" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_todo_ai_suggestions_todo_id" FOREIGN KEY ("todo_id") REFERENCES "todos" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_todo_ai_suggestions_message_id" FOREIGN KEY ("message_id") REFERENCES "todo_ai_messages" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_todo_ai_suggestions_created_by_user_id" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_todo_ai_suggestions_applied_by_user_id" FOREIGN KEY ("applied_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "fk_todo_ai_suggestions_applied_progress_entry_id" FOREIGN KEY ("applied_progress_entry_id") REFERENCES "todo_progress_entries" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_todo_ai_suggestions_todo_status" ON "todo_ai_suggestions" ("todo_id", "status");
