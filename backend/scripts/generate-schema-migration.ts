import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { CardUserLayout } from '../src/database/entities/card-user-layout.entity';
import { Card } from '../src/database/entities/card.entity';
import { EmailCode } from '../src/database/entities/email-code.entity';
import { Tag } from '../src/database/entities/tag.entity';
import { TapdConfig } from '../src/database/entities/tapd-config.entity';
import { TodoProgressEntry } from '../src/database/entities/todo-progress.entity';
import { Todo } from '../src/database/entities/todo.entity';
import { User } from '../src/database/entities/user.entity';

type Options = {
  dbPath: string;
  outputDir: string;
  name?: string;
  help: boolean;
  checkOnly: boolean;
};

type LoggedQuery = {
  query: string;
  parameters?: unknown[];
};

const SCRIPT_DIR = resolve(__dirname);
const BACKEND_DIR = resolve(SCRIPT_DIR, '..');

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dbPath: process.env.DATABASE_PATH ?? resolve(BACKEND_DIR, 'data', 'app.db'),
    outputDir: resolve(BACKEND_DIR, 'migrations', 'sql'),
    help: false,
    checkOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--name') {
      options.name = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--db') {
      options.dbPath = argv[index + 1];
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
      '  npm run db:migration:generate -- --name <migration_name> [--db <db_path>] [--dir <output_dir>]',
      '  ts-node ./scripts/generate-schema-migration.ts --check [--db <db_path>]',
      '',
      'Examples:',
      '  npm run db:migration:generate -- --name create_shared_layout_table',
      '  npm run db:migration:generate -- --name add_due_index --db ./data/app.db',
      '  ts-node ./scripts/generate-schema-migration.ts --check',
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
    .map((item) => `${item.replace(/;+\s*$/g, '')};`);
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: options.dbPath,
    entities: [User, EmailCode, Tag, Todo, TodoProgressEntry, Card, TapdConfig, CardUserLayout],
    synchronize: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
    const statements = toStatements(sqlInMemory.upQueries);

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
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migration] failed: ${message}`);
  process.exit(1);
});
