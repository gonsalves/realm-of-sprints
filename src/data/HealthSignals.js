/**
 * HealthSignals — pure-logic module that classifies task and person health.
 *
 * No Three.js dependency. Produces health states that the visual layer consumes.
 *
 * Task health states (worst wins):
 *   healthy   — everything is fine
 *   stagnant  — stuck in the same stage too long without progress
 *   atRisk    — deadline approaching (within warning window)
 *   overdue   — past deadline
 *
 * Person workload states:
 *   normal    — active task count <= capacity
 *   overloaded — active task count > capacity
 */

// ─── Health state enum (ordered by severity) ─────────────────────
export const HealthState = Object.freeze({
  HEALTHY:  'healthy',
  STAGNANT: 'stagnant',
  AT_RISK:  'atRisk',
  OVERDUE:  'overdue',
});

export const WorkloadState = Object.freeze({
  NORMAL:     'normal',
  OVERLOADED: 'overloaded',
});

// Severity ordering for "worst wins" merging
const SEVERITY = {
  [HealthState.HEALTHY]:  0,
  [HealthState.STAGNANT]: 1,
  [HealthState.AT_RISK]:  2,
  [HealthState.OVERDUE]:  3,
};

// ─── Default configuration ───────────────────────────────────────

/** Default "days in stage" thresholds before a task is considered stagnant. */
const DEFAULT_STAGNATION_DAYS = {
  planning:     5,
  ideating:     5,
  exploration:  7,
  building:     10,
  documenting:  5,
  sharing:      3,
  presenting:   3,
};

/** Default number of days before deadline to flag as "at risk". */
const DEFAULT_DEADLINE_WARNING_DAYS = 3;

/** Default max active (non-complete) tasks per person before overload. */
const DEFAULT_WORKLOAD_CAPACITY = 3;

/**
 * Merge two health states, keeping the worse one.
 */
export function worstHealth(a, b) {
  return (SEVERITY[a] || 0) >= (SEVERITY[b] || 0) ? a : b;
}

// ─── Deadline classification ─────────────────────────────────────

/**
 * Classify a task's deadline health.
 * @param {string|undefined} expectedDate — ISO date string (YYYY-MM-DD)
 * @param {Date} [now] — current date (for testing)
 * @param {number} [warningDays] — days before deadline to flag as at-risk
 * @returns {HealthState}
 */
export function classifyDeadline(expectedDate, now = new Date(), warningDays = DEFAULT_DEADLINE_WARNING_DAYS) {
  if (!expectedDate) return HealthState.HEALTHY; // no deadline = no pressure

  const deadline = new Date(expectedDate + 'T23:59:59');
  const msPerDay = 86400000;
  const daysRemaining = (deadline - now) / msPerDay;

  if (daysRemaining < 0) return HealthState.OVERDUE;
  if (daysRemaining <= warningDays) return HealthState.AT_RISK;
  return HealthState.HEALTHY;
}

// ─── Stagnation tracking ─────────────────────────────────────────

/**
 * StagnationTracker — tracks how long each task has been in its current
 * stage without progress. Call `update()` on every store change.
 *
 * This is an in-memory tracker (not persisted). Stagnation timers start
 * from when the app boots or when the task's stage/progress last changed.
 */
export class StagnationTracker {
  /**
   * @param {Object} [stagnationDays] — per-stage day thresholds
   */
  constructor(stagnationDays = DEFAULT_STAGNATION_DAYS) {
    this._thresholds = { ...DEFAULT_STAGNATION_DAYS, ...stagnationDays };
    /** @type {Map<string, { stage: string|null, percentComplete: number, since: number }>} */
    this._entries = new Map();
  }

  /**
   * Update tracker with current task list. Call on every store change.
   * @param {Array<{id: string, stage?: string, percentComplete?: number}>} tasks
   * @param {number} [nowMs] — current timestamp in ms (for testing)
   */
  update(tasks, nowMs = Date.now()) {
    for (const task of tasks) {
      const entry = this._entries.get(task.id);
      const stage = task.stage || null;
      const pct = task.percentComplete || 0;

      if (!entry) {
        // First time seeing this task
        this._entries.set(task.id, { stage, percentComplete: pct, since: nowMs });
      } else if (entry.stage !== stage || entry.percentComplete !== pct) {
        // Stage or progress changed — reset timer
        entry.stage = stage;
        entry.percentComplete = pct;
        entry.since = nowMs;
      }
      // If nothing changed, timer keeps ticking from entry.since
    }

    // Remove entries for tasks that no longer exist
    for (const id of this._entries.keys()) {
      if (!tasks.some(t => t.id === id)) {
        this._entries.delete(id);
      }
    }
  }

  /**
   * Classify whether a task is stagnant.
   * @param {string} taskId
   * @param {number} [nowMs] — current timestamp in ms
   * @returns {HealthState}
   */
  classify(taskId, nowMs = Date.now()) {
    const entry = this._entries.get(taskId);
    if (!entry || !entry.stage) return HealthState.HEALTHY;

    const thresholdDays = this._thresholds[entry.stage];
    if (thresholdDays == null) return HealthState.HEALTHY;

    const elapsedDays = (nowMs - entry.since) / 86400000;
    return elapsedDays >= thresholdDays ? HealthState.STAGNANT : HealthState.HEALTHY;
  }

  /**
   * Get the number of days a task has been in its current stage.
   * @param {string} taskId
   * @param {number} [nowMs]
   * @returns {number}
   */
  daysInStage(taskId, nowMs = Date.now()) {
    const entry = this._entries.get(taskId);
    if (!entry) return 0;
    return (nowMs - entry.since) / 86400000;
  }

  /**
   * Get the stagnation threshold for a stage in days.
   * @param {string} stage
   * @returns {number|undefined}
   */
  getThreshold(stage) {
    return this._thresholds[stage];
  }
}

// ─── Workload classification ─────────────────────────────────────

/**
 * Compute workload state for each person.
 * @param {Array<{id: string, assigneeId: string, percentComplete?: number}>} tasks
 * @param {Array<{id: string}>} people
 * @param {number} [capacity] — max active tasks before overload
 * @returns {Map<string, { state: WorkloadState, activeCount: number, capacity: number }>}
 */
export function classifyWorkloads(tasks, people, capacity = DEFAULT_WORKLOAD_CAPACITY) {
  const result = new Map();

  // Initialize all people
  for (const person of people) {
    result.set(person.id, { state: WorkloadState.NORMAL, activeCount: 0, capacity });
  }

  // Count active (non-complete) tasks per person
  for (const task of tasks) {
    if ((task.percentComplete || 0) >= 100) continue;
    const entry = result.get(task.assigneeId);
    if (entry) {
      entry.activeCount++;
    }
  }

  // Classify
  for (const [, entry] of result) {
    entry.state = entry.activeCount > entry.capacity
      ? WorkloadState.OVERLOADED
      : WorkloadState.NORMAL;
  }

  return result;
}

// ─── Combined task health ────────────────────────────────────────

/**
 * Compute the combined health state for a single task.
 * Takes the worst of deadline and stagnation signals.
 * Completed tasks (>= 100%) are always healthy.
 *
 * @param {Object} task — task object with stage, percentComplete, expectedDate
 * @param {StagnationTracker} stagnationTracker
 * @param {Date} [now] — current date
 * @param {number} [warningDays]
 * @returns {HealthState}
 */
export function classifyTaskHealth(task, stagnationTracker, now = new Date(), warningDays = DEFAULT_DEADLINE_WARNING_DAYS) {
  // Completed tasks are always healthy
  if ((task.percentComplete || 0) >= 100) return HealthState.HEALTHY;

  const deadlineHealth = classifyDeadline(task.expectedDate, now, warningDays);
  const stagnationHealth = stagnationTracker.classify(task.id, now.getTime());

  return worstHealth(deadlineHealth, stagnationHealth);
}
