import { generateUUID } from '../utils/Math.js';

const STORAGE_KEY = 'workrpg-data-v3';

export class Store {
  constructor(adapter) {
    this._adapter = adapter;
    this._listeners = {};
    this._data = {
      people: [],
      tasks: [],
      milestones: [],
      resourceTypes: [],
      mapState: {
        revealedTiles: [],   // ["col,row", ...]
        resourceNodes: [],   // [{ col, row, resourceType, taskId, depleted }]
      },
    };
    this._loadLocal();
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.people)) {
          this._data = parsed;
          // Ensure mapState exists (migration from older saves)
          if (!this._data.mapState) {
            this._data.mapState = { revealedTiles: [], resourceNodes: [] };
          }
        }
      }
    } catch { /* ignore corrupt data */ }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    this.emit('change');
  }

  // --- Event emitter ---

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  off(event, cb) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(fn => fn !== cb);
  }

  emit(event, data) {
    if (!this._listeners[event]) return;
    for (const cb of this._listeners[event]) cb(data);
  }

  // --- Adapter sync ---

  setAdapter(adapter) {
    this._adapter = adapter;
  }

  async syncFromAdapter() {
    const [people, tasks, milestones, resourceTypes] = await Promise.all([
      this._adapter.fetchPeople(),
      this._adapter.fetchTasks(),
      this._adapter.fetchMilestones(),
      this._adapter.fetchResourceTypes(),
    ]);

    this._data.people = people;
    this._data.tasks = tasks;
    this._data.milestones = milestones;
    this._data.resourceTypes = resourceTypes;

    // Preserve existing mapState (fog, resource node positions) across syncs
    this._save();
  }

  // --- People queries ---

  getPeople() { return this._data.people; }

  getPerson(id) { return this._data.people.find(p => p.id === id); }

  // --- Task queries ---

  getTasks() { return this._data.tasks; }

  getTask(id) { return this._data.tasks.find(t => t.id === id); }

  getTasksForPerson(personId) {
    return this._data.tasks.filter(t => t.assigneeId === personId);
  }

  getTasksForMilestone(milestoneId) {
    const ms = this.getMilestone(milestoneId);
    if (!ms) return [];
    return this._data.tasks.filter(t => ms.taskIds.includes(t.id));
  }

  // --- Milestone queries ---

  getMilestones() { return this._data.milestones; }

  getMilestone(id) { return this._data.milestones.find(m => m.id === id); }

  // --- Resource queries ---

  getResourceTypes() { return this._data.resourceTypes; }

  getResourceNodes() { return this._data.mapState.resourceNodes; }

  getRevealedTiles() { return this._data.mapState.revealedTiles; }

  // --- People mutations ---

  addPerson(person) {
    const newPerson = {
      id: generateUUID(),
      name: person.name || 'New Person',
      role: person.role || '',
      color: person.color || '#607D8B',
    };
    this._data.people.push(newPerson);
    this._save();
    return newPerson;
  }

  updatePerson(id, changes) {
    const person = this.getPerson(id);
    if (!person) return;
    Object.assign(person, changes);
    this._save();
  }

  removePerson(id) {
    this._data.people = this._data.people.filter(p => p.id !== id);
    // Also remove their tasks
    this._data.tasks = this._data.tasks.filter(t => t.assigneeId !== id);
    this._save();
  }

  // --- Task mutations ---

  addTask(task) {
    const newTask = {
      id: generateUUID(),
      name: task.name || 'New Task',
      description: task.description || '',
      assigneeId: task.assigneeId,
      category: task.category || '',
      stage: task.stage || 'planning',
      size: task.size || 'medium',
      discoveryPercent: task.discoveryPercent ?? 50,
      executionPercent: task.executionPercent ?? 50,
      expectedDate: task.expectedDate || new Date().toISOString().split('T')[0],
      percentComplete: task.percentComplete ?? 0,
      milestoneId: task.milestoneId || null,
    };
    this._data.tasks.push(newTask);
    this._save();
    return newTask;
  }

  updateTask(taskId, changes) {
    const task = this.getTask(taskId);
    if (!task) return;
    Object.assign(task, changes);
    this._save();
  }

  removeTask(taskId) {
    this._data.tasks = this._data.tasks.filter(t => t.id !== taskId);
    // Remove from milestones
    for (const ms of this._data.milestones) {
      ms.taskIds = ms.taskIds.filter(id => id !== taskId);
    }
    this._save();
  }

  // --- Milestone mutations ---

  addMilestone(milestone) {
    const ms = {
      id: generateUUID(),
      name: milestone.name || 'New Milestone',
      taskIds: milestone.taskIds || [],
    };
    this._data.milestones.push(ms);
    this._save();
    return ms;
  }

  updateMilestone(id, changes) {
    const ms = this.getMilestone(id);
    if (!ms) return;
    Object.assign(ms, changes);
    this._save();
  }

  removeMilestone(id) {
    this._data.milestones = this._data.milestones.filter(m => m.id !== id);
    this._save();
  }

  // --- Map state mutations ---

  setTileRevealed(col, row) {
    const key = `${col},${row}`;
    if (!this._data.mapState.revealedTiles.includes(key)) {
      this._data.mapState.revealedTiles.push(key);
      // Don't call _save() per tile — batch from fog system
    }
  }

  saveMapState() {
    this._save();
  }

  addResourceNode(node) {
    // { col, row, resourceType, taskId, depleted }
    const existing = this._data.mapState.resourceNodes.find(n => n.taskId === node.taskId);
    if (existing) return existing;
    this._data.mapState.resourceNodes.push(node);
    return node;
  }

  depleteResourceNode(taskId) {
    const node = this._data.mapState.resourceNodes.find(n => n.taskId === taskId);
    if (node) node.depleted = true;
  }

  // --- Reset ---

  resetToSeed() {
    localStorage.removeItem(STORAGE_KEY);
    this._data = {
      people: [],
      tasks: [],
      milestones: [],
      resourceTypes: [],
      mapState: { revealedTiles: [], resourceNodes: [] },
    };
    this.emit('change');
  }
}
