import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { CLIENT_MODEL_INFO, RISK_MODEL_VERSION } from '../services/risk.js';

const router = Router();
router.use(authenticate);

// Informasi model risiko. Model berjalan di browser (client-side); backend hanya
// mengembalikan metadata dan tidak memanggil layanan ML terpisah.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        ...CLIENT_MODEL_INFO,
        engine: 'client',
        available: true,
        fallback_model_version: RISK_MODEL_VERSION,
      },
    });
  }),
);

export default router;
