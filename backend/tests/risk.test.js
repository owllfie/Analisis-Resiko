import { test, expect } from 'bun:test';
import { computeTaskRisk, RISK_MODEL_VERSION } from '../src/services/risk.js';

const now = new Date('2026-01-15T00:00:00Z');
const day = (offset) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

test('tugas selesai selalu berisiko rendah tanpa faktor', () => {
  const r = computeTaskRisk(
    { status: 'completed', progress: 100, importance: 'high', due_date: day(-10) },
    { now },
  );
  expect(r.risk_level).toBe('low');
  expect(r.contributing_factors.length).toBe(0);
  expect(r.model_version).toBe(RISK_MODEL_VERSION);
});

test('tugas melewati tenggat berisiko tinggi', () => {
  const r = computeTaskRisk(
    { status: 'in_progress', progress: 30, importance: 'high', start_date: day(-15), due_date: day(-2) },
    { now },
  );
  expect(r.risk_level).toBe('high');
  expect(r.risk_score).toBeGreaterThanOrEqual(65);
  expect(r.contributing_factors.some((f) => f.factor === 'overdue')).toBe(true);
});

test('tugas terhambat menambah faktor blocked', () => {
  const r = computeTaskRisk(
    { status: 'blocked', progress: 20, importance: 'medium', start_date: day(-5), due_date: day(10) },
    { now },
  );
  expect(r.contributing_factors.some((f) => f.factor === 'blocked')).toBe(true);
});

test('keterlambatan progres terdeteksi', () => {
  const r = computeTaskRisk(
    { status: 'in_progress', progress: 10, importance: 'medium', start_date: day(-10), due_date: day(10) },
    { now },
  );
  expect(r.contributing_factors.some((f) => f.factor === 'progress_lag')).toBe(true);
});

test('perkiraan keterlambatan dihitung berbasis aturan', () => {
  const r = computeTaskRisk(
    {
      status: 'in_progress', progress: 0, importance: 'medium',
      start_date: day(-2), due_date: day(1), estimated_duration: 5,
    },
    { now },
  );
  expect(r.predicted_delay_days).toBeGreaterThan(0);
});

test('tugas tanpa tenggat tidak menghasilkan delay', () => {
  const r = computeTaskRisk(
    { status: 'todo', progress: 0, importance: 'low', estimated_duration: 5 },
    { now },
  );
  expect(r.predicted_delay_days).toBeNull();
});
