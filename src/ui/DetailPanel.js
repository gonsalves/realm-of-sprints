import { computeStaminaBreakdown } from '../data/ResourceCalculator.js';
import { UnitStateLabels } from '../units/UnitState.js';
import { CONFIG } from '../utils/Config.js';

function deriveEmail(name, domain) {
  return name.trim().toLowerCase().replace(/\s+/g, '.') + '@' + domain;
}

// Stage display names and colors (shared with TaskPopup)
const STAGE_DISPLAY = {
  planning:     { label: 'Planning',     color: '#A0AAB8' },
  ideating:     { label: 'Ideating',     color: '#C4A0E8' },
  exploration:  { label: 'Exploration',  color: '#5BA4CF' },
  building:     { label: 'Building',     color: '#E8A040' },
  documenting:  { label: 'Documenting',  color: '#8A9A7C' },
  sharing:      { label: 'Sharing',      color: '#C0B090' },
  presenting:   { label: 'Presenting',   color: '#E86040' },
};

const HEALTH_DISPLAY = {
  healthy:  { label: 'On Track',  color: '#8A9A7C' },
  stagnant: { label: 'Stagnant',  color: '#A0AAB8' },
  atRisk:   { label: 'At Risk',   color: '#E8A040' },
  overdue:  { label: 'Overdue',   color: '#CC5544' },
};

export class DetailPanel {
  constructor(container, store) {
    this.store = store;
    this.personId = null;
    this._unitManagerRef = null;

    // Health/workload providers (set externally)
    this._healthProvider = null;      // (taskId) => 'healthy'|'stagnant'|'atRisk'|'overdue'
    this._workloadProvider = null;    // (personId) => { state, activeCount, capacity }

    this.el = document.createElement('div');
    this.el.className = 'detail-panel';
    container.appendChild(this.el);
  }

  setUnitManager(unitManager) {
    this._unitManagerRef = unitManager;
  }

  /**
   * Set providers for health and workload data.
   * @param {Function} healthFn — (taskId) => HealthState string
   * @param {Function} workloadFn — (personId) => { state, activeCount, capacity }
   */
  setHealthProviders(healthFn, workloadFn) {
    this._healthProvider = healthFn;
    this._workloadProvider = workloadFn;
  }

  open(personId) {
    this.personId = personId;
    this._render();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    this.personId = null;
  }

  refresh() {
    if (!this.el.classList.contains('open')) return;
    if (this.personId) {
      this._render();
    }
  }

  _render() {
    const person = this.store.getPerson(this.personId);
    if (!person) {
      this.close();
      return;
    }

    const tasks = this.store.getTasksForPerson(this.personId);
    const breakdown = computeStaminaBreakdown(tasks);
    const staminaPct = Math.round(breakdown.total * 100);
    const timePct = Math.round(breakdown.timeFactor * 100);
    const phasePct = Math.round(breakdown.phaseFactor * 100);
    const discoveryPct = Math.round(breakdown.discoveryRatio * 100);

    // Unit state
    let activityLabel = 'Idle';
    if (this._unitManagerRef) {
      const sm = this._unitManagerRef.getUnitState(this.personId);
      if (sm) activityLabel = sm.getLabel();
    }

    // Workload
    const workload = this._workloadProvider ? this._workloadProvider(this.personId) : null;
    const workloadHtml = workload ? this._renderWorkload(workload) : '';

    // Health summary — count flagged tasks
    const healthSummary = this._computeHealthSummary(tasks);

    // Action button data
    const email = deriveEmail(person.name, CONFIG.EMAIL_DOMAIN);
    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE`
      + `&text=${encodeURIComponent('1:1 with ' + person.name)}`
      + `&details=${encodeURIComponent('Scheduled from Work RPG')}`
      + `&add=${encodeURIComponent(email)}`
      + `&dur=0030`;
    const sheetUrl = CONFIG.GOOGLE_SHEET_URL + '?q=' + encodeURIComponent(person.name);

    this.el.innerHTML = `
      <button class="detail-panel-close">&times;</button>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:40px;height:40px;border-radius:50%;background:${person.color};flex-shrink:0;"></div>
        <div>
          <div class="detail-name">${person.name}</div>
          <div class="detail-role">${person.role}</div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Current Activity</div>
        <div style="padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:13px;color:#E8E4DC;">
          ${activityLabel}
        </div>
      </div>

      ${workloadHtml}

      ${healthSummary}

      <div class="detail-section">
        <div class="detail-section-title">Actions</div>
        <div class="detail-actions">
          <div class="detail-action-group">
            <button class="detail-action-btn" data-action="email">
              <span class="detail-action-icon">&#9993;</span>
              Send Email
            </button>
            <div class="detail-action-chips" data-chips="email">
              <a class="detail-chip" href="mailto:${email}?subject=${encodeURIComponent('What are you working on?')}" target="_blank">What are you working on?</a>
              <a class="detail-chip" href="mailto:${email}?subject=${encodeURIComponent('Can you give me an update?')}" target="_blank">Can you give me an update?</a>
              <a class="detail-chip" href="mailto:${email}?subject=${encodeURIComponent("Let's sync up")}" target="_blank">Let's sync up</a>
            </div>
          </div>

          <a class="detail-action-btn" href="${calendarUrl}" target="_blank" rel="noopener">
            <span class="detail-action-icon">&#128197;</span>
            Schedule 1:1
          </a>

          <a class="detail-action-btn" href="${sheetUrl}" target="_blank" rel="noopener">
            <span class="detail-action-icon">&#128203;</span>
            View Tasks
          </a>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Stamina</div>
        <div class="energy-bar-container">
          <div class="energy-bar-fill" style="width:${staminaPct}%;background:${staminaBarColor(breakdown.total)};"></div>
          <div class="energy-bar-label">${staminaPct}%</div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Stamina Breakdown</div>
        <div class="energy-breakdown">
          <div class="energy-factor">
            <div class="energy-factor-label">Time Pressure: ${timePct}%</div>
            <div class="energy-factor-bar">
              <div class="energy-factor-fill" style="width:${timePct}%;background:${staminaBarColor(breakdown.timeFactor)};"></div>
            </div>
          </div>
          <div class="energy-factor">
            <div class="energy-factor-label">Scout/Gather Balance: ${phasePct}%</div>
            <div class="energy-factor-bar">
              <div class="energy-factor-fill" style="width:${phasePct}%;background:${staminaBarColor(breakdown.phaseFactor)};"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Scout / Gather Balance</div>
        <div class="task-phase-bar" style="height:8px;border-radius:4px;">
          <div class="task-phase-discovery" style="width:${discoveryPct}%;"></div>
          <div class="task-phase-execution" style="width:${100 - discoveryPct}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;">
          <span style="color:#A0AAB8;">Scout ${discoveryPct}%</span>
          <span style="color:#C0B090;">Gather ${100 - discoveryPct}%</span>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Tasks (${tasks.length})</div>
        ${tasks.map(task => this._renderTask(task, breakdown)).join('')}
        ${tasks.length === 0 ? '<div style="color:#666;font-size:12px;">No tasks assigned</div>' : ''}
      </div>
    `;

    // Close button
    this.el.querySelector('.detail-panel-close').addEventListener('click', () => this.close());

    // Email chips toggle
    const emailBtn = this.el.querySelector('[data-action="email"]');
    const emailChips = this.el.querySelector('[data-chips="email"]');
    if (emailBtn && emailChips) {
      emailBtn.addEventListener('click', () => {
        emailChips.classList.toggle('expanded');
      });
    }
  }

  _renderWorkload(workload) {
    const isOverloaded = workload.state === 'overloaded';
    const barPct = Math.min(100, Math.round((workload.activeCount / workload.capacity) * 100));
    const barColor = isOverloaded ? '#CC5544' : barPct > 75 ? '#E8A040' : '#8A9A7C';

    return `
      <div class="detail-section">
        <div class="detail-section-title">Workload</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:13px;color:#E8E4DC;">${workload.activeCount} / ${workload.capacity} tasks</span>
          ${isOverloaded ? '<span style="font-size:11px;color:#CC5544;font-weight:600;">OVERLOADED</span>' : ''}
        </div>
        <div class="energy-bar-container" style="height:6px;">
          <div class="energy-bar-fill" style="width:${barPct}%;background:${barColor};"></div>
        </div>
      </div>
    `;
  }

  _computeHealthSummary(tasks) {
    if (!this._healthProvider) return '';

    const flagged = [];
    for (const task of tasks) {
      if ((task.percentComplete || 0) >= 100) continue;
      const health = this._healthProvider(task.id);
      if (health !== 'healthy') {
        const info = HEALTH_DISPLAY[health] || HEALTH_DISPLAY.healthy;
        flagged.push({ task, health, info });
      }
    }

    if (flagged.length === 0) return '';

    return `
      <div class="detail-section">
        <div class="detail-section-title">Health Alerts (${flagged.length})</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${flagged.map(f => `
            <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:4px;border-left:2px solid ${f.info.color};">
              <span style="font-size:11px;font-weight:600;color:${f.info.color};">${f.info.label}</span>
              <span style="font-size:11px;color:#D0C8B8;flex:1;">${f.task.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderTask(task, breakdown) {
    const taskBreakdown = breakdown.perTask.find(t => t.taskId === task.id);
    const daysUntilDue = taskBreakdown ? taskBreakdown.daysUntilDue : null;
    const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
    const dateLabel = daysUntilDue === null
      ? 'No due date'
      : isOverdue
        ? `${Math.abs(daysUntilDue)} days overdue`
        : daysUntilDue === 0
          ? 'Due today'
          : `${daysUntilDue} days remaining`;

    const categoryBadge = task.category
      ? `<span style="background:rgba(160,170,184,0.12);color:#A0AAB8;padding:2px 6px;border-radius:4px;font-size:10px;">${task.category}</span>`
      : '';

    // Stage badge
    const stageInfo = STAGE_DISPLAY[task.stage] || null;
    const stageBadge = stageInfo
      ? `<span style="background:${stageInfo.color}22;color:${stageInfo.color};padding:2px 6px;border-radius:4px;font-size:10px;border:1px solid ${stageInfo.color}33;">${stageInfo.label}</span>`
      : '';

    // Health indicator dot
    const health = this._healthProvider ? this._healthProvider(task.id) : 'healthy';
    const healthInfo = HEALTH_DISPLAY[health] || HEALTH_DISPLAY.healthy;
    const healthDot = health !== 'healthy'
      ? `<span style="width:6px;height:6px;border-radius:50%;background:${healthInfo.color};flex-shrink:0;" title="${healthInfo.label}"></span>`
      : '';

    // Size label
    const sizeLabel = task.size ? task.size.charAt(0).toUpperCase() : '';

    return `
      <div class="task-item">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          ${healthDot}
          <div class="task-name">${task.name}</div>
          ${stageBadge}
          ${categoryBadge}
          ${sizeLabel ? `<span style="background:rgba(255,255,255,0.06);color:#888;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:600;">${sizeLabel}</span>` : ''}
        </div>
        ${task.description ? `<div class="task-desc">${task.description}</div>` : ''}
        <div class="task-progress">
          <div class="task-progress-fill" style="width:${task.percentComplete}%;"></div>
        </div>
        <div class="task-meta">
          <span>${task.percentComplete}% complete</span>
          <span class="${isOverdue ? 'overdue' : ''}">${dateLabel}</span>
        </div>
      </div>
    `;
  }
}

function staminaBarColor(value) {
  if (value > 0.65) return '#8A9A7C';
  if (value > 0.35) return '#C8C0A0';
  return '#C0A090';
}
