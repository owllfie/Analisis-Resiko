/*
 * Uji parity: inferensi JavaScript harus sama dengan hasil Python saat ekspor.
 * Jalankan dari folder frontend/:
 *
 *   bun run test:model
 */
import { readFileSync } from 'node:fs';
import { predictOne, predictProbabilities } from '../src/ml/riskModel.js';

const model = JSON.parse(readFileSync(new URL('../public/models/risk-model.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../../ml/model-golden.json', import.meta.url), 'utf8'));

const TOLERANCE = 1e-6;
let maxDiff = 0;
let failures = 0;

for (const [index, sample] of golden.samples.entries()) {
  const actual = predictProbabilities(model, sample.features);
  const predicted = predictOne(model, sample.features);

  for (const cls of golden.classes) {
    const diff = Math.abs(Number(actual[cls]) - Number(sample.probabilities[cls]));
    maxDiff = Math.max(maxDiff, diff);
    if (diff > TOLERANCE) {
      failures += 1;
      console.error(`[FAIL] sampel ${index} kelas ${cls}: JS=${actual[cls]} Python=${sample.probabilities[cls]} (diff ${diff})`);
    }
  }

  const scoreDiff = Math.abs(Number(predicted.risk_score) - Number(sample.risk_score));
  if (scoreDiff > 0.02) {
    failures += 1;
    console.error(`[FAIL] sampel ${index} risk_score: JS=${predicted.risk_score} Python=${sample.risk_score}`);
  }
  if (predicted.risk_level !== sample.risk_level) {
    failures += 1;
    console.error(`[FAIL] sampel ${index} risk_level: JS=${predicted.risk_level} Python=${sample.risk_level}`);
  }
}

console.log(`[verify] model ${model.model_version} · ${golden.samples.length} sampel · selisih probabilitas maksimum ${maxDiff.toExponential(2)}`);

if (failures > 0) {
  console.error(`[verify] GAGAL: ${failures} ketidaksesuaian`);
  process.exit(1);
}
console.log('[verify] OK: inferensi JavaScript cocok dengan Python');
