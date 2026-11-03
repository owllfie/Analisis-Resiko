import mysql from 'mysql2/promise';
import { config } from './env.js';

// Koneksi ke MySQL 8. `decimalNumbers` agar DECIMAL dikembalikan sebagai angka
// (bukan string) sehingga respons API konsisten dengan perilaku lama.
// `dateStrings` khusus kolom DATE agar kembali sebagai 'YYYY-MM-DD' murni tanpa
// pergeseran zona waktu (kolom DATETIME/TIMESTAMP tetap objek Date).
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: true,
  dateStrings: ['DATE'],
  charset: 'utf8mb4',
});

// Normalisasi parameter: mysql2 menolak `undefined` (umum terjadi pada field opsional).
function normalizeParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map((p) => (p === undefined ? null : p));
}

/**
 * Menjalankan query dan mengembalikan bentuk yang kompatibel dengan pola lama
 * (`const { rows } = await query(...)`), ditambah insertId/affectedRows.
 */
export async function query(text, params) {
  const [result, fields] = await pool.query(text, normalizeParams(params));
  if (Array.isArray(result)) {
    return { rows: result, fields, insertId: undefined, affectedRows: result.length };
  }
  return { rows: [], fields, insertId: result.insertId, affectedRows: result.affectedRows };
}

/**
 * Menjalankan beberapa query dalam satu transaksi. Handler menerima objek
 * `client` dengan API `query()` yang sama persis dengan `query` di atas.
 */
export async function withTransaction(handler) {
  const conn = await pool.getConnection();
  const client = {
    async query(text, params) {
      const [result, fields] = await conn.query(text, normalizeParams(params));
      if (Array.isArray(result)) {
        return { rows: result, fields, insertId: undefined, affectedRows: result.length };
      }
      return { rows: [], fields, insertId: result.insertId, affectedRows: result.affectedRows };
    },
  };

  try {
    await conn.beginTransaction();
    const result = await handler(client);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Abaikan kegagalan rollback; error asli yang dilempar kembali.
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function waitForDatabase(retries = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[db] menunggu database siap... (${attempt}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Database tidak dapat dihubungi setelah beberapa percobaan');
}
