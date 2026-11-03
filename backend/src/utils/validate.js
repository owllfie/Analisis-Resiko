import { badRequest } from './errors.js';

// Validator sederhana tanpa dependensi tambahan.

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function asString(value, field, { required = true, max = 5000, min = 0 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`Field '${field}' wajib diisi`);
    return undefined;
  }
  if (typeof value !== 'string') throw badRequest(`Field '${field}' harus berupa teks`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(`Field '${field}' terlalu pendek`);
  if (trimmed.length > max) throw badRequest(`Field '${field}' melebihi ${max} karakter`);
  return trimmed;
}

export function asEmail(value, field = 'email') {
  const s = asString(value, field, { max: 160 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw badRequest(`Format email '${field}' tidak valid`);
  }
  return s;
}

export function asInt(value, field, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`Field '${field}' wajib diisi`);
    return undefined;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw badRequest(`Field '${field}' harus bilangan bulat`);
  if (n < min || n > max) throw badRequest(`Field '${field}' harus antara ${min} dan ${max}`);
  return n;
}

export function asNumber(value, field, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`Field '${field}' wajib diisi`);
    return undefined;
  }
  const n = Number(value);
  if (Number.isNaN(n)) throw badRequest(`Field '${field}' harus berupa angka`);
  if (n < min || n > max) throw badRequest(`Field '${field}' harus antara ${min} dan ${max}`);
  return n;
}

export function asDate(value, field, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`Field '${field}' wajib diisi`);
    return undefined;
  }
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw badRequest(`Field '${field}' harus tanggal dengan format YYYY-MM-DD`);
  }
  return s;
}

export function asEnum(value, field, allowed, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`Field '${field}' wajib diisi`);
    return undefined;
  }
  if (!allowed.includes(value)) {
    throw badRequest(`Field '${field}' harus salah satu dari: ${allowed.join(', ')}`);
  }
  return value;
}
