-- migration: 20260328T044500Z_normalize_card_user_layouts.sql
-- notes: align legacy card_user_layouts table with the current entity schema.

DROP INDEX IF EXISTS "IDX_card_user_layout_user_id";
DROP INDEX IF EXISTS "IDX_card_user_layout_card_id";
DROP TABLE IF EXISTS "temporary_card_user_layouts";

CREATE TABLE "temporary_card_user_layouts" (
  "id" varchar PRIMARY KEY NOT NULL,
  "card_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "x" integer NOT NULL DEFAULT (0),
  "y" integer NOT NULL DEFAULT (0),
  "w" integer NOT NULL DEFAULT (4),
  "h" integer NOT NULL DEFAULT (4),
  "layouts_json" text,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_f99c9e5dccd4d3daaf7d2671102" UNIQUE ("card_id", "user_id"),
  CONSTRAINT "FK_9ff24ac7936c6bc078629b450fb" FOREIGN KEY ("card_id") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_6c7e87e86419bb51279c084bca5" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

INSERT INTO "temporary_card_user_layouts" (
  "id",
  "card_id",
  "user_id",
  "x",
  "y",
  "w",
  "h",
  "layouts_json",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "card_id",
  "user_id",
  "x",
  "y",
  "w",
  "h",
  "layouts_json",
  "created_at",
  "updated_at"
FROM "card_user_layouts";

DROP TABLE "card_user_layouts";
ALTER TABLE "temporary_card_user_layouts" RENAME TO "card_user_layouts";
