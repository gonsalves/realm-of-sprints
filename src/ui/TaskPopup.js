/**
 * TaskPopup — floating popup that appears when clicking a task marker (resource node).
 *
 * Displays:
 *   - Task name, description
 *   - Current stage and time in stage
 *   - Size / effort estimate
 *   - Assignee (clickable link to detail panel)
 *   - Deadline and health status (on track / at risk / overdue)
 *   - Action buttons: Open in Jira/Sheets, send email to assignee
 */

import * as THREE from 'three';
import { CONFIG } from '../utils/Config.js';

// Stage display names and colors
const STAGE_DISPLAY = {
  planning:     { label: 'Planning',     color: '#A0AAB8' },
  ideating:     { label: 'Ideating',     color: '#C4A0E8' },
  exploration:  { label: 'Exploration',  color: '#5BA4CF' },
  building:     { label: 'Building',     color: '#E8A040' },
  documenting:  { label: 'Documenting',  color: '#8A9A7C' },
  sharing:      { label: 'Sharing',      color: '#C0B090' },
  presenting:   { label: 'Presenting',   color: '#E86040' },
};

const SIZE_DISPLAY = {
  small:  { label: 'Small',  icon: 'S' },
  medium: { label: 'Medium', icon: 'M' },
  large:  { label: 'Large',  icon: 'L' },
};

const HEALTH_DISPLAY = {
  healthy:  { label: 'On Track',  color: '#8A9A7C', bg: 'rgba(138,154,124,0.15)' },
  stagnant: { label: 'Stagnant',  color: '#A0AAB8', bg: 'rgba(160,170,184,0.15)' },
  atRisk:   { label: 'At Risk',   color: '#E8A040', bg: 'rgba(232,160,64,0.15)' },
  overdue:  { label: 'Overdue',   color: '#CC5544', bg: 'rgba(204,85,68,0.15)' },
};

function deriveEmail(name, domain) {
  return name.trim().toLowerCase().replace(/\s+/g, '.') + '@' + domain;
}

export class TaskPopup {
  /**
   * @param {HTMLElement} container — UI root
   * @param {Store} store
   */
  constructor(container, store) {
    this.store = store;
    this.taskId = null;
    this._worldPos = new THREE.Vector3();
    this._camera = null;
    this._personClickCallbacks = [];

    // Health/stagnation providers (set externally)
    this._healthProvider = null;     // (taskId) => 'healthy'|'stagnant'|'atRisk'|'overdue'
    this._daysInStageProvider = null; // (taskId) => number

    this.el = document.createElement('div');
    this.el.className = 'task-popup';
    container.appendChild(this.el);
  }

  setCamera(camera) {
    this._camera = camera;
  }

  /**
   * Set providers for health and stagnation data.
   * @param {Function} healthFn — (taskId) => HealthState string
   * @param {Function} daysInStageFn — (taskId) => number
   */
  setHealthProviders(healthFn, daysInStageFn) {
    this._healthProvider = healthFn;
    this._daysInStageProvider = daysInStageFn;
  }

  open(taskId, sceneX, sceneZ) {
    this.taskId = taskId;
    this._worldPos.set(sceneX, 3, sceneZ);
    this._render();
    this.el.classList.add('open');
    this.updatePosition();
  }

  close() {
    this.el.classList.remove('open');
    this.taskId = null;
  }

  isOpen() {
    return this.taskId !== null;
  }

  refresh() {
    if (!this.isOpen()) return;
    this._render();
  }

  updatePosition() {
    if (!this.isOpen() || !this._camera) return;

    const vec = this._worldPos.clone();
    vec.project(this._camera);

    if (vec.z > 1) {
      this.el.style.opacity = '0';
      this.el.style.pointerEvents = 'none';
      return;
    }

    const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;

    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.opacity = '';
    this.el.style.pointerEvents = '';
  }

  onPersonClick(cb) {
    this._personClickCallbacks.push(cb);
  }

  _render() {
    const task = this.store.getTask(this.taskId);
    if (!task) {
      this.close();
      return;
    }

    const assignee = task.assigneeId ? this.store.getPerson(task.assigneeId) : null;

    // Stage info
    const stageInfo = STAGE_DISPLAY[task.stage] || { label: task.stage || 'Unknown', color: '#888' };
    const sizeInfo = SIZE_DISPLAY[task.size] || SIZE_DISPLAY.medium;

    // Health state
    const health = this._healthProvider ? this._healthProvider(this.taskId) : 'healthy';
    const healthInfo = HEALTH_DISPLAY[health] || HEALTH_DISPLAY.healthy;

    // Days in stage
    const daysInStage = this._daysInStageProvider ? this._daysInStageProvider(this.taskId) : 0;
    const daysLabel = daysInStage < 1 ? 'Today' : `${Math.round(daysInStage)}d`;

    // Deadline
    const deadlineLabel = this._formatDeadline(task.expectedDate);

    // Action URLs
    const email = assignee ? deriveEmail(assignee.name, CONFIG.EMAIL_DOMAIN) : null;
    const sheetUrl = CONFIG.GOOGLE_SHEET_URL + '?q=' + encodeURIComponent(task.name);

    this.el.innerHTML = `
      <button class="task-popup-close">&times;</button>

      <div class="task-popup-header">
        <div class="task-popup-name">${task.name}</div>
      </div>

      ${task.description ? `<div class="task-popup-desc">${task.description}</div>` : ''}

      <div class="task-popup-badges">
        <span class="task-popup-badge" style="background:${stageInfo.color}22;color:${stageInfo.color};border:1px solid ${stageInfo.color}33;">
          ${stageInfo.label}
        </span>
        <span class="task-popup-badge" style="background:rgba(160,170,184,0.1);color:#A0AAB8;border:1px solid rgba(160,170,184,0.15);">
          ${sizeInfo.icon} &middot; ${sizeInfo.label}
        </span>
        <span class="task-popup-badge" style="background:${healthInfo.bg};color:${healthInfo.color};border:1px solid ${healthInfo.color}33;">
          ${healthInfo.label}
        </span>
      </div>

      <div class="task-popup-meta">
        <div class="task-popup-meta-row">
          <span class="task-popup-meta-label">Time in stage</span>
          <span class="task-popup-meta-value">${daysLabel}</span>
        </div>
        <div class="task-popup-meta-row">
          <span class="task-popup-meta-label">Progress</span>
          <span class="task-popup-meta-value">${Math.round(task.percentComplete || 0)}%</span>
        </div>
        <div class="task-popup-meta-row">
          <span class="task-popup-meta-label">Deadline</span>
          <span class="task-popup-meta-value ${health === 'overdue' ? 'overdue' : ''}">${deadlineLabel}</span>
        </div>
        ${assignee ? `
          <div class="task-popup-meta-row">
            <span class="task-popup-meta-label">Assignee</span>
            <button class="task-popup-assignee" data-person-id="${assignee.id}">
              <span class="task-popup-assignee-swatch" style="background:${assignee.color};"></span>
              ${assignee.name}
            </button>
          </div>
        ` : ''}
      </div>

      <div class="task-progress" style="margin:8px 0 4px;">
        <div class="task-progress-fill" style="width:${Math.round(task.percentComplete || 0)}%;"></div>
      </div>

      <div class="task-popup-actions">
        ${email ? `
          <a class="task-popup-action-btn" href="mailto:${email}?subject=${encodeURIComponent('Re: ' + task.name)}" target="_blank">
            Send Email
          </a>
        ` : ''}
        <a class="task-popup-action-btn" href="${sheetUrl}" target="_blank" rel="noopener">
          View in Source
        </a>
      </div>
    `;

    // Close button
    this.el.querySelector('.task-popup-close').addEventListener('click', () => this.close());

    // Assignee click
    const assigneeBtn = this.el.querySelector('.task-popup-assignee');
    if (assigneeBtn) {
      assigneeBtn.addEventListener('click', () => {
        const pid = assigneeBtn.dataset.personId;
        if (pid) {
          for (const cb of this._personClickCallbacks) cb(pid);
        }
      });
    }
  }

  _formatDeadline(expectedDate) {
    if (!expectedDate) return 'No deadline';
    const deadline = new Date(expectedDate + 'T23:59:59');
    const now = new Date();
    const msPerDay = 86400000;
    const daysRemaining = Math.ceil((deadline - now) / msPerDay);

    if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d overdue`;
    if (daysRemaining === 0) return 'Due today';
    return `${daysRemaining}d remaining`;
  }
}
