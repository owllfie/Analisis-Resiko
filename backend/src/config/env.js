import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${name} wajib diisi`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: required('JWT_SECRET', 'change-me-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'app',
    password: process.env.DB_PASSWORD || 'app',
    database: process.env.DB_NAME || 'project_ai',
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // Layanan Machine Learning (FastAPI) untuk prediksi risiko v2.
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  // Data demo kini NONAKTIF secara bawaan agar aplikasi dipakai dengan data nyata.
  seedDemo: (process.env.SEED_DEMO || 'false').toLowerCase() === 'true',
  // Akun admin pertama dibuat otomatis bila belum ada pengguna sama sekali.
  admin: {
    name: process.env.ADMIN_NAME || 'Administrator',
    email: (process.env.ADMIN_EMAIL || 'admin@gmail.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin123!',
  },
  // Set true hanya bila aplikasi diakses melalui HTTPS.
  cookieSecure: (process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true',
};
