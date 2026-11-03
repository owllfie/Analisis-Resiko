const BASE = '/api';

async function request(path, { method = 'GET', body, headers } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson && text ? JSON.parse(text) : text;

  if (!res.ok) {
    const message = (payload && payload.error && payload.error.message) || 'Terjadi kesalahan';
    const error = new Error(message);
    error.status = res.status;
    error.details = payload?.error?.details;
    throw error;
  }
  return payload;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  delete: (p) => request(p, { method: 'DELETE' }),
};
