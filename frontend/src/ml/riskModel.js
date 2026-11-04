/*
 * Inferensi model risiko sepenuhnya di browser.
 *
 * Model yang dimuat adalah MLP kecil hasil ekspor `ml/export_client_model.py`:
 *   StandardScaler -> Dense(ReLU) -> Dense(ReLU) -> Dense(softmax)
 *
 * Tidak ada panggilan ke layanan ML/Python saat runtime. File model hanya
 * diunduh sekali sebagai aset statis dan di-cache browser.
 */

export const RISK_LEVELS = ['low', 'medium', 'high'];

// Bobot keparahan tiap kelas; harus sama dengan ml/export_client_model.py.
export const SEVERITY = Object.freeze({ low: 12, medium: 50, high: 90 });

const MAX_CONTRIBUTIONS = 6;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function modelAssetUrl(baseUrl = '/') {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}models/risk-model.json`;
}

export async function loadRiskModel(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Model risiko gagal dimuat (HTTP ${res.status})`);
  const model = await res.json();
  if (!Array.isArray(model.feature_names) || !Array.isArray(model.classes)) {
    throw new Error('Format model risiko tidak valid');
  }
  if (!Array.isArray(model.layers) || model.layers.length === 0) {
    throw new Error('Bobot model risiko tidak ditemukan');
  }
  return model;
}

function vectorize(model, item) {
  return model.feature_names.map((name) => toNumber(item?.[name], 0));
}

function scaleVector(model, raw) {
  const mean = model.scaler?.mean || [];
  const scale = model.scaler?.scale || [];
  return raw.map((value, i) => {
    const m = toNumber(mean[i], 0);
    const s = toNumber(scale[i], 1) || 1;
    return (value - m) / s;
  });
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const total = exps.reduce((sum, v) => sum + v, 0) || 1;
  return exps.map((v) => v / total);
}

function forward(model, raw) {
  let input = scaleVector(model, raw);
  const last = model.layers.length - 1;
  for (let layerIndex = 0; layerIndex <= last; layerIndex += 1) {
    const layer = model.layers[layerIndex];
    const weights = layer.weights || [];
    const biases = layer.biases || [];
    const output = new Array(biases.length).fill(0);
    for (let j = 0; j < biases.length; j += 1) {
      let z = toNumber(biases[j], 0);
      for (let i = 0; i < input.length; i += 1) {
        z += input[i] * toNumber(weights[i]?.[j], 0);
      }
      // Hidden layer memakai ReLU; layer terakhir dibiarkan linier lalu softmax.
      output[j] = layerIndex === last ? z : Math.max(0, z);
    }
    input = output;
  }
  // Temperature scaling hasil kalibrasi Python; membuat probabilitas tidak
  // terlalu ekstrem sehingga faktor kontribusi tetap bermakna.
  const temperature = toNumber(model.temperature, 1) || 1;
  return softmax(input.map((value) => value / temperature));
}

function probabilityMap(model, output) {
  const map = { low: 0, medium: 0, high: 0 };
  for (let i = 0; i < model.classes.length; i += 1) {
    const cls = model.classes[i];
    if (cls in map) map[cls] = toNumber(output[i], 0);
  }
  return map;
}

function severityOf(probabilities) {
  return RISK_LEVELS.reduce(
    (sum, level) => sum + toNumber(probabilities[level], 0) * SEVERITY[level],
    0,
  );
}

export function predictProbabilities(model, item) {
  return probabilityMap(model, forward(model, vectorize(model, item)));
}

/**
 * Prediksi satu tugas + penjelasan faktor kontribusi (ablasi fitur).
 * Bentuk keluaran sama dengan respons layanan ML lama agar backend tidak perlu
 * mengubah format penyimpanan.
 */
export function predictOne(model, item) {
  const raw = vectorize(model, item);
  const probabilities = probabilityMap(model, forward(model, raw));
  const riskLevel = RISK_LEVELS.reduce(
    (best, level) => (probabilities[level] > probabilities[best] ? level : best),
    'low',
  );
  const riskScore = severityOf(probabilities);

  // Ablasi: kembalikan satu fitur ke rata-rata pelatihan, ukur perubahan skor.
  const trainMean = model.train_mean || [];
  const baselineScores = model.feature_names.map((_, index) => {
    const baseline = raw.slice();
    baseline[index] = toNumber(trainMean[index], 0);
    return severityOf(probabilityMap(model, forward(model, baseline)));
  });
  const contributions = baselineScores.map((score) => riskScore - score);

  const drivers = contributions
    .map((contribution, index) => ({ contribution, index }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, MAX_CONTRIBUTIONS)
    .map(({ contribution, index }) => {
      const feature = model.feature_names[index];
      return {
        feature,
        label: model.feature_labels?.[feature] || feature,
        value: round(raw[index], 2),
        contribution: round(contribution, 2),
        direction: contribution > 0 ? 'up' : 'down',
      };
    });

  return {
    task_id: item?.task_id ?? null,
    risk_level: riskLevel,
    risk_score: round(riskScore, 2),
    confidence: round(probabilities[riskLevel], 4),
    probabilities: {
      low: round(probabilities.low, 4),
      medium: round(probabilities.medium, 4),
      high: round(probabilities.high, 4),
    },
    drivers,
    model_version: model.model_version,
  };
}

export function predictBatch(model, items) {
  return (items || []).map((item) => predictOne(model, item));
}
