import { loadRiskModel, predictBatch } from './riskModel.js';

// Web Worker: memuat model dan menjalankan inferensi tanpa memblokir UI.
self.onmessage = async (event) => {
  const { modelUrl, items } = event.data || {};
  try {
    const model = await loadRiskModel(modelUrl);
    const results = predictBatch(model, items || []);
    self.postMessage({ ok: true, results });
  } catch (err) {
    self.postMessage({ ok: false, error: err?.message || 'Gagal menjalankan model risiko' });
  }
};
