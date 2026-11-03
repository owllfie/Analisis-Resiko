import { HttpError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Endpoint tidak ditemukan', code: 'NOT_FOUND' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { message: err.message, code: err.status, details: err.details },
    });
  }

  const pgCode = err?.code;
  if (pgCode === '23505') {
    return res.status(409).json({ error: { message: 'Data sudah ada (duplikat)', code: 409 } });
  }
  if (pgCode === '23503') {
    return res.status(400).json({ error: { message: 'Referensi data tidak valid', code: 400 } });
  }
  if (pgCode === '23514') {
    return res.status(400).json({ error: { message: 'Nilai tidak memenuhi aturan validasi', code: 400 } });
  }

  console.error('[error]', err.message);
  return res.status(500).json({
    error: { message: 'Terjadi kesalahan pada server', code: 500 },
  });
}
