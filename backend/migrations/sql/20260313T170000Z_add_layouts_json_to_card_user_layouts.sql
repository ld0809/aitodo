-- migration: 20260313T170000Z_add_layouts_json_to_card_user_layouts.sql
-- notes: add per-viewport card layout storage for responsive dashboards.

ALTER TABLE "card_user_layouts"
  ADD COLUMN "layouts_json" text;

