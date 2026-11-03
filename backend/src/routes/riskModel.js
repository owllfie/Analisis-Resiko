import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { fetchModelInfo } from '../services/riskMl.js';
import { RISK_MODEL_VERSION } from '../services/risk.js';

const router = Router();
router.use(authenticate);

// Informasi model risiko yang dipakai saat ini (ML jika tersedia, jika tidak fallback aturan).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      const info = await fetchModelInfo();
      return res.json({ data: { ...info, engine: 'ml', available: true } });
    } catch (err) {
      return res.json({
        data: {
          engine: 'rules',
          available: false,
          model_version: RISK_MODEL_VERSION,
          algorithm: 'Rule-based heuristic',
          note: 'Layanan Machine Learning tidak tersedia; sistem memakai fallback berbasis aturan.',
        },
      });
    }
  }),
);

export default router;
