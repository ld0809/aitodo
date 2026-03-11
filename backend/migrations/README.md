## SQL Migrations

Directory: `backend/migrations/sql`

Workflow:

1. Before changing DB structure in entities, ensure local `DATABASE_PATH` points to your current baseline DB.
2. After entity changes, generate SQL:
   - `cd backend`
   - `npm run db:migration:generate -- --name <change_name>`
3. Review and adjust generated SQL if needed, then commit the new `.sql` file.
4. Deployment runs `backend/scripts/apply-sql-migrations.js`, which:
   - Creates `schema_migrations` table if missing.
   - Applies new `.sql` files in lexical order.
   - Records filename + checksum.
   - Refuses checksum-changed already-applied files.

Rules:

- Migration files must not contain `BEGIN/COMMIT/ROLLBACK`; the apply script wraps each file in a transaction.
- Do not edit an already-applied migration file. Create a new migration instead.
