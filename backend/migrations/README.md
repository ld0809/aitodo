## SQL Migrations

Directory: `backend/migrations/sql`

Workflow:

1. Before changing DB structure in entities, ensure committed SQL migrations reflect the current baseline schema.
2. After entity changes, generate SQL:
   - `cd backend`
   - `npm run db:migration:generate -- --name <change_name>`
   - 首次为历史自动同步结构补基线时，可用：
     `npm run db:migration:generate -- --name schema_baseline --baseline`
3. Review and adjust generated SQL if needed, then commit the new `.sql` file.
4. Deployment runs `backend/scripts/apply-sql-migrations.js`, which:
   - Creates `schema_migrations` table if missing.
   - Applies new `.sql` files in lexical order.
   - Records filename + checksum.
   - Refuses checksum-changed already-applied files.

Rules:

- Migration files must not contain `BEGIN/COMMIT/ROLLBACK`; the apply script wraps each file in a transaction.
- Do not edit an already-applied migration file. Create a new migration instead.
- The generator builds a temporary baseline DB from committed SQL migrations by default, which avoids local `synchronize` drift hiding pending changes.
- `--baseline` mode emits an idempotent schema snapshot for the current entities, suitable for one-time baseline backfills.
