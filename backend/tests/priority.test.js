import { test, expect } from 'bun:test';
import { computeTaskPriorities, urgencyScore, importanceScore } from '../src/services/priority.js';

const now = new Date('2026-01-15T00:00:00Z');
const day = (offset) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

test('urgensi meningkat saat tenggat dekat', () => {
  expect(urgencyScore(day(-1), now)).toBeGreaterThan(urgencyScore(day(3), now));
  expect(urgencyScore(day(3), now)).toBeGreaterThan(urgencyScore(day(30), now));
});

test('kepentingan tinggi bernilai lebih besar', () => {
  expect(importanceScore('high')).toBeGreaterThan(importanceScore('medium'));
  expect(importanceScore('medium')).toBeGreaterThan(importanceScore('low'));
});

test('tugas dengan tenggat lebih dekat diprioritaskan lebih tinggi', () => {
  const tasks = [
    { id: 1, title: 'nanti', status: 'todo', due_date: day(30), importance: 'medium', assignee_id: null, project_id: 1 },
    { id: 2, title: 'segera', status: 'todo', due_date: day(1), importance: 'medium', assignee_id: null, project_id: 1 },
  ];
  const result = computeTaskPriorities(tasks, { now });
  expect(result[0].task_id).toBe(2);
});

test('tugas yang prasyaratnya belum selesai diturunkan prioritasnya', () => {
  const tasks = [
    { id: 1, title: 'prasyarat', status: 'todo', due_date: day(3), importance: 'high', assignee_id: null, project_id: 1 },
    { id: 2, title: 'tergantung', status: 'todo', due_date: day(1), importance: 'high', assignee_id: null, project_id: 1 },
  ];
  const depsByTask = new Map([[2, [{ depends_on_task_id: 1, title: 'prasyarat', status: 'todo' }]]]);
  const result = computeTaskPriorities(tasks, { now, depsByTask });
  const dependent = result.find((r) => r.task_id === 2);
  expect(dependent.blocked_by.length).toBe(1);
  expect(dependent.reasons.some((r) => r.includes('prasyarat'))).toBe(true);
  expect(result[0].task_id).toBe(1);
});

test('tugas selesai mendapat skor nol', () => {
  const tasks = [
    { id: 1, title: 'selesai', status: 'completed', due_date: day(-1), importance: 'high', assignee_id: null, project_id: 1 },
  ];
  const result = computeTaskPriorities(tasks, { now });
  expect(result[0].priority_score).toBe(0);
});
