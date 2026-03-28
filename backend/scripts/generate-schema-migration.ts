import 'dotenv/config';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { APP_ENTITIES } from '../src/database/entity-list';

type Options = {
  baselineDbPath?: string;
  outputDir: string;
  name?: string;
  help: boolean;
  checkOnly: boolean;
  baselineSnapshot: boolean;
};

type LoggedQuery = {
  query: string;
  parameters?: unknown[];
};

const SCRIPT_DIR = resolve(__dirname);
const BACKEND_DIR = resolve(SCRIPT_DIR, '..');

function parseArgs(argv: string[]): Options {
  const options: Options = {
    outputDir: resolve(BACKEND_DIR, 'migrations', 'sql'),
    help: false,
    checkOnly: false,
    baselineSnapshot: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--name') {
      options.name = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--db') {
      options.baselineDbPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--dir') {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--check') {
      options.checkOnly = true;
      continue;
    }
    if (arg === '--baseline') {
      options.baselineSnapshot = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`unknown arg: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  npm run db:migration:generate -- --name <migration_name> [--db <baseline_db_path>] [--dir <output_dir>]',
      '  npm run db:migration:generate -- --name <migration_name> --baseline',
      '  ts-node ./scripts/generate-schema-migration.ts --check [--db <baseline_db_path>]',
      '',
      'Examples:',
      '  npm run db:migration:generate -- --name create_shared_layout_table',
      '  npm run db:migration:generate -- --name schema_baseline --baseline',
      '  npm run db:migration:generate -- --name add_due_index --db ./data/baseline.db',
      '  ts-node ./scripts/generate-schema-migration.ts --check',
      '',
      'Notes:',
      '  - Without --db, the script builds a temporary baseline database from committed SQL migrations.',
      '  - This avoids false negatives caused by local TypeORM synchronize drift.',
    ].join('\n'),
  );
}

function normalizeName(rawName: string) {
  const normalized = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) {
    throw new Error('invalid migration name');
  }
  return normalized;
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }
  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function inlineParameters(query: string, parameters?: unknown[]) {
  if (!parameters || parameters.length === 0) {
    return query;
  }
  let index = 0;
  return query.replace(/\?/g, () => {
    const value = parameters[index];
    index += 1;
    return toSqlLiteral(value);
  });
}

function toStatements(queries: LoggedQuery[]) {
  return queries
    .map((item) => inlineParameters(item.query, item.parameters).trim())
    .filter((item) => item.length > 0)
    .map((item) => ensureIdempotentCreateStatement(item))
    .map((item) => `${item.replace(/;+\s*$/g, '')};`);
}

function ensureIdempotentCreateStatement(statement: string) {
  return statement
    .replace(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE INDEX\s+(?!IF NOT EXISTS)/i, 'CREATE INDEX IF NOT EXISTS ');
}

function buildTimestamp() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

function buildBaselineFromMigrations(dbPath: string, migrationsDir: string) {
  const applyScriptPath = resolve(BACKEND_DIR, 'scripts', 'apply-sql-migrations.js');
  const result = spawnSync(process.execPath, [applyScriptPath, '--db', dbPath, '--dir', migrationsDir], {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(stderr || stdout || 'failed to build baseline database from migrations');
  }
}

async function buildBaselineSnapshotStatements() {
  const tempDir = mkdtempSync(resolve(tmpdir(), 'aitodo-schema-snapshot-'));
  const dbPath = resolve(tempDir, 'schema-snapshot.db');
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: dbPath,
    entities: APP_ENTITIES,
    synchronize: true,
    logging: false,
  });

  try {
    await dataSource.initialize();
    const rows = (await dataSource.query(`
      SELECT type, name, sql
      FROM sqlite_master
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
        AND name != 'schema_migrations'
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name
    `)) as Array<{ sql: string }>;

    return rows
      .map((row) => row.sql.trim())
      .filter((statement) => statement.length > 0)
      .map((statement) => ensureIdempotentCreateStatement(statement))
      .map((statement) => `${statement.replace(/;+\s*$/g, '')};`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function prepareBaselineDatabase(options: Options) {
  if (options.baselineDbPath) {
    return {
      dbPath: options.baselineDbPath,
      cleanup: () => {},
    };
  }

  const tempDir = mkdtempSync(resolve(tmpdir(), 'aitodo-schema-baseline-'));
  const dbPath = resolve(tempDir, 'baseline.db');
  buildBaselineFromMigrations(dbPath, options.outputDir);

  return {
    dbPath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const baseline = options.baselineSnapshot
    ? {
        dbPath: '',
        cleanup: () => {},
      }
    : prepareBaselineDatabase(options);
  const dataSource = options.baselineSnapshot
    ? null
    : new DataSource({
        type: 'better-sqlite3',
        database: baseline.dbPath,
        entities: APP_ENTITIES,
        synchronize: false,
        logging: false,
      });

  try {
    const statements = options.baselineSnapshot
      ? await buildBaselineSnapshotStatements()
      : await (async () => {
          const activeDataSource = dataSource as DataSource;
          await activeDataSource.initialize();
          const sqlInMemory = await activeDataSource.driver.createSchemaBuilder().log();
          return toStatements(sqlInMemory.upQueries);
        })();

    if (options.checkOnly) {
      if (statements.length > 0) {
        console.error(`[db:migration] pending schema changes detected: ${statements.length} statements`);
        process.exit(2);
      }
      console.log('[db:migration] schema is up-to-date');
      return;
    }

    if (statements.length === 0) {
      console.log('[db:migration] no schema changes detected');
      return;
    }

    if (!options.name) {
      throw new Error('schema changed, please provide --name to generate migration sql');
    }

    const normalizedName = normalizeName(options.name);
    if (!existsSync(options.outputDir)) {
      mkdirSync(options.outputDir, { recursive: true });
    }
    const timestamp = buildTimestamp();
    const fileName = `${timestamp}_${normalizedName}.sql`;
    const filePath = resolve(options.outputDir, fileName);
    const content = [
      `-- migration: ${fileName}`,
      `-- generated_at_utc: ${new Date().toISOString()}`,
      '-- notes: no BEGIN/COMMIT here, apply script wraps this file in one transaction.',
      '',
      ...statements,
      '',
    ].join('\n');

    writeFileSync(filePath, content, 'utf8');
    console.log(`[db:migration] generated: ${filePath}`);
    console.log(`[db:migration] statements: ${statements.length}`);
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    baseline.cleanup();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migration] failed: ${message}`);
  process.exit(1);
});
