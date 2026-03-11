#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const SCRIPT_DIR = __dirname;
const BACKEND_DIR = path.resolve(SCRIPT_DIR, '..');

function parseArgs(argv) {
  const options = {
    dbPath: process.env.DATABASE_PATH || path.join(BACKEND_DIR, 'data', 'app.db'),
    migrationsDir: path.join(BACKEND_DIR, 'migrations', 'sql'),
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--db') {
      options.dbPath = argv[++i];
      continue;
    }
    if (arg === '--dir') {
      options.migrationsDir = argv[++i];
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
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
      '  node scripts/apply-sql-migrations.js [--db <db_path>] [--dir <migrations_dir>] [--dry-run]',
      '',
      'Examples:',
      '  node scripts/apply-sql-migrations.js',
      '  node scripts/apply-sql-migrations.js --db /opt/aitodo/backend/data/app.db',
      '  node scripts/apply-sql-migrations.js --dry-run',
    ].join('\n'),
  );
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.dbPath) {
    throw new Error('--db is required');
  }
  if (!options.migrationsDir) {
    throw new Error('--dir is required');
  }

  if (!fs.existsSync(options.migrationsDir)) {
    console.log(`[db:migrate] migrations directory not found, skip: ${options.migrationsDir}`);
    return;
  }

  const migrationFiles = fs
    .readdirSync(options.migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    console.log('[db:migrate] no sql migration files found');
    return;
  }

  fs.mkdirSync(path.dirname(options.dbPath), { recursive: true });

  const db = new Database(options.dbPath);
  try {
    db.pragma('foreign_keys = ON');
    ensureMigrationsTable(db);

    const appliedRows = db.prepare('SELECT filename, checksum FROM schema_migrations').all();
    const appliedMap = new Map(appliedRows.map((row) => [row.filename, row.checksum]));
    const insertMigration = db.prepare('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)');

    let appliedCount = 0;
    for (const fileName of migrationFiles) {
      const filePath = path.join(options.migrationsDir, fileName);
      const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
      const checksum = sha256(content);

      const previousChecksum = appliedMap.get(fileName);
      if (previousChecksum) {
        if (previousChecksum !== checksum) {
          throw new Error(`checksum mismatch for already-applied migration: ${fileName}`);
        }
        continue;
      }

      if (!content) {
        console.log(`[db:migrate] skip empty migration: ${fileName}`);
        continue;
      }

      const nonCommentContent = stripSqlComments(content);
      if (/\b(begin|commit|rollback)\b/i.test(nonCommentContent)) {
        throw new Error(`migration must not contain transaction statements: ${fileName}`);
      }

      if (options.dryRun) {
        console.log(`[db:migrate] pending: ${fileName}`);
        continue;
      }

      const executeMigration = db.transaction(() => {
        db.exec(content);
        insertMigration.run(fileName, checksum);
      });
      executeMigration();
      appliedCount += 1;
      console.log(`[db:migrate] applied: ${fileName}`);
    }

    if (options.dryRun) {
      console.log('[db:migrate] dry-run completed');
      return;
    }

    console.log(`[db:migrate] done, applied=${appliedCount}, db=${options.dbPath}`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migrate] failed: ${message}`);
  process.exit(1);
}
