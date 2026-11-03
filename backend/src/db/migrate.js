import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config/env.js';
import { waitForDatabase } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

// Koneksi khusus migrasi: `multipleStatements` diaktifkan agar satu berkas .sql
// (berisi banyak perintah DDL) dapat dijalankan sekaligus. Hanya dipakai untuk
// berkas migrasi tepercaya yang ada di direktori ini, bukan input pengguna.
async function createMigrationConnection() {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) NOT NULL,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function runMigrations() {
  await waitForDatabase();
  const conn = await createMigrationConnection();
  try {
    await ensureMigrationsTable(conn);
    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip ${file} (sudah diterapkan)`);
        continue;
      }
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] menerapkan ${file}`);
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      } catch (err) {
        throw new Error(`Migrasi gagal pada ${file}: ${err.message}`);
      }
    }
    console.log('[migrate] selesai');
  } finally {
    await conn.end();
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] error:', err.message);
      process.exit(1);
    });
}
