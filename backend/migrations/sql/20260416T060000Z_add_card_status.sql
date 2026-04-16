-- migration: 20260416T060000Z_add_card_status.sql
-- generated_at_utc: 2026-04-16T06:00:00.000Z
-- notes: no BEGIN/COMMIT here, apply script wraps this file in one transaction.

ALTER TABLE "cards" ADD COLUMN "status" varchar NOT NULL DEFAULT ('active');
