import { api } from '../api/client.js';

const WORKER_TIMEOUT_MS = 15000;

function modelUrl(version) {
  const base = import.meta.env.BASE_URL || '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  const suffix = version ? `?v=${encodeURIComponent(version)}` : '';
  return `${normalized}models/risk-model.json${suffix}`;
}

function runClientModel(items, version) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./riskWorker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Model risiko terlalu lama merespons'));
    }, WORKER_TIMEOUT_MS);

    const finish = (callback) => {
      clearTimeout(timer);
      worker.terminate();
      callback();
    };

    worker.onmessage = (event) => {
      const data = event.data || {};
      finish(() => {
        if (data.ok) resolve(data.results || []);
        else reject(new Error(data.error || 'Gagal menjalankan model risiko'));
      });
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'Worker model risiko gagal')));
    };

    worker.postMessage({ modelUrl: modelUrl(version), items });
  });
}

/**
 * Jalankan analisis risiko satu proyek:
 * 1. ambil vektor fitur dari backend (query SQL ringan),
 * 2. inferensi model di browser (Web Worker),
 * 3. simpan hasil ke backend.
 *
 * Bila model gagal dimuat/dijalankan, backend memakai fallback aturan rules-v1.
 */
export async function analyzeProjectRisk(projectId) {
  const featuresRes = await api.get(`/projects/${projectId}/risk-features`);
  const items = featuresRes.data?.items || [];
  const modelVersion = featuresRes.data?.model_version;

  if (items.length === 0) {
    const saved = await api.post(`/projects/${projectId}/analyze-risk`);
    return { ...saved, clientSide: false, fallback: false };
  }

  let predictions;
  try {
    predictions = await runClientModel(items, modelVersion);
  } catch (err) {
    console.warn(`[risk] model client gagal dijalankan, memakai fallback aturan: ${err.message}`);
    const saved = await api.post(`/projects/${projectId}/analyze-risk`);
    return { ...saved, clientSide: false, fallback: true, clientError: err.message };
  }

  const saved = await api.post(`/projects/${projectId}/analyze-risk`, { predictions });
  return { ...saved, clientSide: true, fallback: false };
}
