-- migration: 20260416T013500Z_add_organizations.sql
-- generated_at_utc: 2026-04-16T01:35:00.000Z
-- notes: add organizations and organization_members for phase 8.

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" varchar PRIMARY KEY NOT NULL,
  "name" varchar NOT NULL,
  "owner_id" varchar NOT NULL,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "FK_organizations_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_organizations_owner_id" ON "organizations" ("owner_id");

CREATE TABLE IF NOT EXISTS "organization_members" (
  "organization_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  PRIMARY KEY ("organization_id", "user_id"),
  CONSTRAINT "FK_organization_members_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_organization_members_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_organization_members_user_id" ON "organization_members" ("user_id");
