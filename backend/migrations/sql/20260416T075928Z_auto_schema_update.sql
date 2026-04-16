-- migration: 20260416T075928Z_auto_schema_update.sql
-- generated_at_utc: 2026-04-16T07:59:28.840Z
-- notes: no BEGIN/COMMIT here, apply script wraps this file in one transaction.

DROP INDEX "idx_organizations_owner_id";
CREATE TABLE IF NOT EXISTS "temporary_organizations" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "owner_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')));
INSERT INTO "temporary_organizations"("id", "name", "owner_id", "created_at", "updated_at") SELECT "id", "name", "owner_id", "created_at", "updated_at" FROM "organizations";
DROP TABLE "organizations";
ALTER TABLE "temporary_organizations" RENAME TO "organizations";
CREATE INDEX IF NOT EXISTS "idx_organizations_owner_id" ON "organizations" ("owner_id");
DROP INDEX "idx_organization_members_user_id";
CREATE TABLE IF NOT EXISTS "temporary_organization_members" ("organization_id" varchar NOT NULL, "user_id" varchar NOT NULL, PRIMARY KEY ("organization_id", "user_id"));
INSERT INTO "temporary_organization_members"("organization_id", "user_id") SELECT "organization_id", "user_id" FROM "organization_members";
DROP TABLE "organization_members";
ALTER TABLE "temporary_organization_members" RENAME TO "organization_members";
CREATE INDEX IF NOT EXISTS "idx_organization_members_user_id" ON "organization_members" ("user_id");
DROP INDEX "idx_organizations_owner_id";
DROP INDEX "idx_organization_members_user_id";
CREATE TABLE IF NOT EXISTS "temporary_organizations" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "owner_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "ownerId" varchar);
INSERT INTO "temporary_organizations"("id", "name", "owner_id", "created_at", "updated_at") SELECT "id", "name", "owner_id", "created_at", "updated_at" FROM "organizations";
DROP TABLE "organizations";
ALTER TABLE "temporary_organizations" RENAME TO "organizations";
CREATE INDEX IF NOT EXISTS "IDX_7062a4fbd9bab22ffd918e5d3d" ON "organization_members" ("organization_id");
CREATE INDEX IF NOT EXISTS "IDX_89bde91f78d36ca41e9515d91c" ON "organization_members" ("user_id");
CREATE TABLE IF NOT EXISTS "temporary_organizations" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "owner_id" varchar NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "ownerId" varchar, CONSTRAINT "FK_cdf778d13ea7fe8095e013e34f0" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION);
INSERT INTO "temporary_organizations"("id", "name", "owner_id", "created_at", "updated_at", "ownerId") SELECT "id", "name", "owner_id", "created_at", "updated_at", "ownerId" FROM "organizations";
DROP TABLE "organizations";
ALTER TABLE "temporary_organizations" RENAME TO "organizations";
DROP INDEX "IDX_7062a4fbd9bab22ffd918e5d3d";
DROP INDEX "IDX_89bde91f78d36ca41e9515d91c";
CREATE TABLE IF NOT EXISTS "temporary_organization_members" ("organization_id" varchar NOT NULL, "user_id" varchar NOT NULL, CONSTRAINT "FK_7062a4fbd9bab22ffd918e5d3d9" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_89bde91f78d36ca41e9515d91c6" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, PRIMARY KEY ("organization_id", "user_id"));
INSERT INTO "temporary_organization_members"("organization_id", "user_id") SELECT "organization_id", "user_id" FROM "organization_members";
DROP TABLE "organization_members";
ALTER TABLE "temporary_organization_members" RENAME TO "organization_members";
CREATE INDEX IF NOT EXISTS "IDX_7062a4fbd9bab22ffd918e5d3d" ON "organization_members" ("organization_id");
CREATE INDEX IF NOT EXISTS "IDX_89bde91f78d36ca41e9515d91c" ON "organization_members" ("user_id");
