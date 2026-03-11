-- migration: 20260311T160000Z_create_card_user_layouts.sql
-- notes: this file is idempotent for already-upgraded environments.

CREATE TABLE IF NOT EXISTS "card_user_layouts" (
  "id" varchar PRIMARY KEY NOT NULL,
  "card_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "x" integer NOT NULL DEFAULT (0),
  "y" integer NOT NULL DEFAULT (0),
  "w" integer NOT NULL DEFAULT (4),
  "h" integer NOT NULL DEFAULT (4),
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_card_user_layout_card_user" UNIQUE ("card_id", "user_id"),
  CONSTRAINT "FK_card_user_layout_card" FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_card_user_layout_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "IDX_card_user_layout_card_id" ON "card_user_layouts" ("card_id");
CREATE INDEX IF NOT EXISTS "IDX_card_user_layout_user_id" ON "card_user_layouts" ("user_id");
