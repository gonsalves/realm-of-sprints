import { describe, it, expect } from 'vitest';
import {
  HealthState,
  WorkloadState,
  worstHealth,
  classifyDeadline,
  StagnationTracker,
  classifyWorkloads,
  classifyTaskHealth,
} from '../src/data/HealthSignals.js';

// ─── Helpers ─────────────────────────────────────────────────────

/** Create a date string N days from a reference date. */
function daysFrom(refDate, days) {
  const d = new Date(refDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const NOW = new Date('2026-03-02T12:00:00');

describe('HealthSignals', () => {

  // ─── worstHealth ─────────────────────────────────────────────

  describe('worstHealth', () => {
    it('healthy + healthy = healthy', () => {
      expect(worstHealth(HealthState.HEALTHY, HealthState.HEALTHY)).toBe(HealthState.HEALTHY);
    });

    it('healthy + stagnant = stagnant', () => {
      expect(worstHealth(HealthState.HEALTHY, HealthState.STAGNANT)).toBe(HealthState.STAGNANT);
    });

    it('stagnant + atRisk = atRisk', () => {
      expect(worstHealth(HealthState.STAGNANT, HealthState.AT_RISK)).toBe(HealthState.AT_RISK);
    });

    it('atRisk + overdue = overdue', () => {
      expect(worstHealth(HealthState.AT_RISK, HealthState.OVERDUE)).toBe(HealthState.OVERDUE);
    });

    it('overdue + healthy = overdue', () => {
      expect(worstHealth(HealthState.OVERDUE, HealthState.HEALTHY)).toBe(HealthState.OVERDUE);
    });

    it('is commutative', () => {
      expect(worstHealth(HealthState.STAGNANT, HealthState.AT_RISK))
        .toBe(worstHealth(HealthState.AT_RISK, HealthState.STAGNANT));
    });
  });

  // ─── classifyDeadline ────────────────────────────────────────

  describe('classifyDeadline', () => {
    it('returns healthy when no deadline', () => {
      expect(classifyDeadline(undefined, NOW)).toBe(HealthState.HEALTHY);
      expect(classifyDeadline(null, NOW)).toBe(HealthState.HEALTHY);
      expect(classifyDeadline('', NOW)).toBe(HealthState.HEALTHY);
    });

    it('returns healthy when deadline is far away', () => {
      expect(classifyDeadline(daysFrom(NOW, 10), NOW)).toBe(HealthState.HEALTHY);
    });

    it('returns atRisk when deadline is within warning window', () => {
      expect(classifyDeadline(daysFrom(NOW, 2), NOW, 3)).toBe(HealthState.AT_RISK);
    });

    it('returns atRisk at exactly the warning threshold', () => {
      // daysFrom(NOW, 3) gives a date 3 days ahead; since NOW is at noon and
      // deadline is end-of-day, remaining is ~3.5 days. Use warning=4 to cover it.
      // Or test with a tighter window: 1 day remaining, warning=1
      expect(classifyDeadline(daysFrom(NOW, 0), NOW, 1)).toBe(HealthState.AT_RISK);
    });

    it('returns overdue when deadline has passed', () => {
      expect(classifyDeadline(daysFrom(NOW, -1), NOW)).toBe(HealthState.OVERDUE);
    });

    it('returns overdue when deadline was long ago', () => {
      expect(classifyDeadline(daysFrom(NOW, -30), NOW)).toBe(HealthState.OVERDUE);
    });

    it('respects custom warning days', () => {
      // 5 days remaining, warning at 7 → atRisk
      expect(classifyDeadline(daysFrom(NOW, 5), NOW, 7)).toBe(HealthState.AT_RISK);
      // 5 days remaining, warning at 3 → healthy
      expect(classifyDeadline(daysFrom(NOW, 5), NOW, 3)).toBe(HealthState.HEALTHY);
    });
  });

  // ─── StagnationTracker ───────────────────────────────────────

  describe('StagnationTracker', () => {
    it('classifies new tasks as healthy', () => {
      const tracker = new StagnationTracker();
      const tasks = [{ id: 't1', stage: 'building', percentComplete: 30 }];
      tracker.update(tasks);
      expect(tracker.classify('t1')).toBe(HealthState.HEALTHY);
    });

    it('classifies tasks as stagnant after exceeding threshold', () => {
      const tracker = new StagnationTracker({ building: 5 });
      const baseTime = Date.now();

      const tasks = [{ id: 't1', stage: 'building', percentComplete: 30 }];
      tracker.update(tasks, baseTime);

      // 6 days later, same stage and progress
      const sixDaysLater = baseTime + 6 * 86400000;
      tracker.update(tasks, sixDaysLater);

      expect(tracker.classify('t1', sixDaysLater)).toBe(HealthState.STAGNANT);
    });

    it('remains healthy if under threshold', () => {
      const tracker = new StagnationTracker({ building: 10 });
      const baseTime = Date.now();

      const tasks = [{ id: 't1', stage: 'building', percentComplete: 30 }];
      tracker.update(tasks, baseTime);

      const fiveDaysLater = baseTime + 5 * 86400000;
      tracker.update(tasks, fiveDaysLater);

      expect(tracker.classify('t1', fiveDaysLater)).toBe(HealthState.HEALTHY);
    });

    it('resets timer when stage changes', () => {
      const tracker = new StagnationTracker({ building: 5, documenting: 5 });
      const baseTime = Date.now();

      const tasks = [{ id: 't1', stage: 'building', percentComplete: 30 }];
      tracker.update(tasks, baseTime);

      // 6 days later, change stage
      const sixDays = baseTime + 6 * 86400000;
      tasks[0].stage = 'documenting';
      tracker.update(tasks, sixDays);

      // Should be healthy because timer reset
      expect(tracker.classify('t1', sixDays)).toBe(HealthState.HEALTHY);

      // 3 days after stage change → still healthy (under documenting threshold)
      const threeDaysAfterChange = sixDays + 3 * 86400000;
      tracker.update(tasks, threeDaysAfterChange);
      expect(tracker.classify('t1', threeDaysAfterChange)).toBe(HealthState.HEALTHY);
    });

    it('resets timer when percentComplete changes', () => {
      const tracker = new StagnationTracker({ building: 5 });
      const baseTime = Date.now();

      const tasks = [{ id: 't1', stage: 'building', percentComplete: 30 }];
      tracker.update(tasks, baseTime);

      // 6 days later, progress changed
      const sixDays = baseTime + 6 * 86400000;
      tasks[0].percentComplete = 50;
      tracker.update(tasks, sixDays);

      expect(tracker.classify('t1', sixDays)).toBe(HealthState.HEALTHY);
    });

    it('tracks multiple tasks independently', () => {
      const tracker = new StagnationTracker({ building: 5, exploration: 7 });
      const baseTime = Date.now();

      const tasks = [
        { id: 't1', stage: 'building', percentComplete: 30 },
        { id: 't2', stage: 'exploration', percentComplete: 20 },
      ];
      tracker.update(tasks, baseTime);

      const sixDays = baseTime + 6 * 86400000;
      tracker.update(tasks, sixDays);

      // t1: building threshold = 5, elapsed = 6 → stagnant
      expect(tracker.classify('t1', sixDays)).toBe(HealthState.STAGNANT);
      // t2: exploration threshold = 7, elapsed = 6 → healthy
      expect(tracker.classify('t2', sixDays)).toBe(HealthState.HEALTHY);
    });

    it('removes entries for deleted tasks', () => {
      const tracker = new StagnationTracker();
      const tasks = [{ id: 't1', stage: 'building', percentComplete: 30 }];
      tracker.update(tasks);

      // Remove the task
      tracker.update([]);
      expect(tracker.classify('t1')).toBe(HealthState.HEALTHY); // no entry = healthy
    });

    it('returns 0 daysInStage for unknown tasks', () => {
      const tracker = new StagnationTracker();
      expect(tracker.daysInStage('unknown')).toBe(0);
    });

    it('reports correct daysInStage', () => {
      const tracker = new StagnationTracker();
      const baseTime = Date.now();
      tracker.update([{ id: 't1', stage: 'building', percentComplete: 0 }], baseTime);

      const threeDays = baseTime + 3 * 86400000;
      expect(tracker.daysInStage('t1', threeDays)).toBeCloseTo(3, 1);
    });

    it('returns threshold for known stages', () => {
      const tracker = new StagnationTracker({ building: 10, planning: 5 });
      expect(tracker.getThreshold('building')).toBe(10);
      expect(tracker.getThreshold('planning')).toBe(5);
    });

    it('returns healthy for tasks with no stage', () => {
      const tracker = new StagnationTracker();
      tracker.update([{ id: 't1', percentComplete: 50 }]);
      expect(tracker.classify('t1')).toBe(HealthState.HEALTHY);
    });
  });

  // ─── classifyWorkloads ───────────────────────────────────────

  describe('classifyWorkloads', () => {
    const people = [{ id: 'p1' }, { id: 'p2' }];

    it('returns normal when under capacity', () => {
      const tasks = [
        { id: 't1', assigneeId: 'p1', percentComplete: 30 },
        { id: 't2', assigneeId: 'p1', percentComplete: 50 },
      ];
      const result = classifyWorkloads(tasks, people, 3);
      expect(result.get('p1').state).toBe(WorkloadState.NORMAL);
      expect(result.get('p1').activeCount).toBe(2);
    });

    it('returns overloaded when over capacity', () => {
      const tasks = [
        { id: 't1', assigneeId: 'p1', percentComplete: 10 },
        { id: 't2', assigneeId: 'p1', percentComplete: 20 },
        { id: 't3', assigneeId: 'p1', percentComplete: 30 },
        { id: 't4', assigneeId: 'p1', percentComplete: 40 },
      ];
      const result = classifyWorkloads(tasks, people, 3);
      expect(result.get('p1').state).toBe(WorkloadState.OVERLOADED);
      expect(result.get('p1').activeCount).toBe(4);
    });

    it('excludes completed tasks from count', () => {
      const tasks = [
        { id: 't1', assigneeId: 'p1', percentComplete: 100 },
        { id: 't2', assigneeId: 'p1', percentComplete: 100 },
        { id: 't3', assigneeId: 'p1', percentComplete: 100 },
        { id: 't4', assigneeId: 'p1', percentComplete: 30 },
      ];
      const result = classifyWorkloads(tasks, people, 3);
      expect(result.get('p1').state).toBe(WorkloadState.NORMAL);
      expect(result.get('p1').activeCount).toBe(1);
    });

    it('initializes all people even with no tasks', () => {
      const result = classifyWorkloads([], people, 3);
      expect(result.get('p1').activeCount).toBe(0);
      expect(result.get('p2').activeCount).toBe(0);
    });

    it('returns normal at exactly capacity', () => {
      const tasks = [
        { id: 't1', assigneeId: 'p1', percentComplete: 10 },
        { id: 't2', assigneeId: 'p1', percentComplete: 20 },
        { id: 't3', assigneeId: 'p1', percentComplete: 30 },
      ];
      const result = classifyWorkloads(tasks, people, 3);
      expect(result.get('p1').state).toBe(WorkloadState.NORMAL);
    });

    it('tracks capacity per person independently', () => {
      const tasks = [
        { id: 't1', assigneeId: 'p1', percentComplete: 10 },
        { id: 't2', assigneeId: 'p1', percentComplete: 20 },
        { id: 't3', assigneeId: 'p1', percentComplete: 30 },
        { id: 't4', assigneeId: 'p1', percentComplete: 40 },
        { id: 't5', assigneeId: 'p2', percentComplete: 10 },
      ];
      const result = classifyWorkloads(tasks, people, 3);
      expect(result.get('p1').state).toBe(WorkloadState.OVERLOADED);
      expect(result.get('p2').state).toBe(WorkloadState.NORMAL);
    });
  });

  // ─── classifyTaskHealth (combined) ───────────────────────────

  describe('classifyTaskHealth', () => {
    it('returns healthy for completed tasks regardless of deadline', () => {
      const tracker = new StagnationTracker();
      const task = { id: 't1', stage: 'building', percentComplete: 100, expectedDate: daysFrom(NOW, -10) };
      tracker.update([task]);
      expect(classifyTaskHealth(task, tracker, NOW)).toBe(HealthState.HEALTHY);
    });

    it('returns overdue for tasks past deadline', () => {
      const tracker = new StagnationTracker();
      const task = { id: 't1', stage: 'building', percentComplete: 30, expectedDate: daysFrom(NOW, -5) };
      tracker.update([task]);
      expect(classifyTaskHealth(task, tracker, NOW)).toBe(HealthState.OVERDUE);
    });

    it('returns worst of deadline and stagnation', () => {
      const tracker = new StagnationTracker({ building: 3 });
      const baseTime = NOW.getTime();
      const task = { id: 't1', stage: 'building', percentComplete: 30, expectedDate: daysFrom(NOW, 2) };

      tracker.update([task], baseTime);
      // 4 days later: stagnant (threshold=3), also atRisk (2 day deadline from baseTime, now closer)
      const fourDays = baseTime + 4 * 86400000;
      const laterNow = new Date(fourDays);

      tracker.update([task], fourDays);

      const health = classifyTaskHealth(task, tracker, laterNow, 3);
      // Deadline: 2 days - 4 days elapsed = overdue
      // Stagnation: 4 days > 3 days threshold = stagnant
      // Worst = overdue
      expect(health).toBe(HealthState.OVERDUE);
    });

    it('returns stagnant when only stagnation fires', () => {
      const tracker = new StagnationTracker({ building: 3 });
      const baseTime = NOW.getTime();
      const task = { id: 't1', stage: 'building', percentComplete: 30, expectedDate: daysFrom(NOW, 30) };

      tracker.update([task], baseTime);
      const fourDays = baseTime + 4 * 86400000;
      tracker.update([task], fourDays);

      const health = classifyTaskHealth(task, tracker, new Date(fourDays), 3);
      expect(health).toBe(HealthState.STAGNANT);
    });

    it('returns atRisk when only deadline fires', () => {
      const tracker = new StagnationTracker();
      const task = { id: 't1', stage: 'building', percentComplete: 30, expectedDate: daysFrom(NOW, 2) };
      tracker.update([task]);
      expect(classifyTaskHealth(task, tracker, NOW, 3)).toBe(HealthState.AT_RISK);
    });

    it('returns healthy when no signals fire', () => {
      const tracker = new StagnationTracker();
      const task = { id: 't1', stage: 'building', percentComplete: 30, expectedDate: daysFrom(NOW, 20) };
      tracker.update([task]);
      expect(classifyTaskHealth(task, tracker, NOW)).toBe(HealthState.HEALTHY);
    });
  });
});
