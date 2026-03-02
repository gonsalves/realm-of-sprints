import { SceneManager } from './scene/SceneManager.js';
import { CameraControls } from './scene/CameraControls.js';
import { Store } from './data/Store.js';
import { SeedAdapter } from './data/SeedAdapter.js';
import { GoogleSheetsAdapter } from './data/GoogleSheetsAdapter.js';
import { GameGrid } from './map/GameGrid.js';
import { TerrainGenerator } from './map/TerrainGenerator.js';
import { BiomeTerrainGenerator } from './map/BiomeTerrainGenerator.js';
import { GameMap } from './map/GameMap.js';
import { FogOfWar } from './map/FogOfWar.js';
import { Base } from './map/Base.js';
import { UnitManager } from './units/UnitManager.js';
import { AnimalManager } from './units/AnimalManager.js';
import { Raycaster } from './interaction/Raycaster.js';
import { Tooltip } from './interaction/Tooltip.js';
import { Toolbar } from './ui/Toolbar.js';
import { EditorPanel } from './ui/EditorPanel.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { DetailPanel } from './ui/DetailPanel.js';
import { StructurePopup } from './ui/StructurePopup.js';
import { CONFIG } from './utils/Config.js';
import { resourceColorForCategory } from './utils/Colors.js';
import { computeStructureProgress } from './data/ResourceCalculator.js';
import { THEME, THEME_NIGHT } from './utils/Theme.js';
import { registerDefaultModels } from './models/registerDefaultModels.js';
import { CastleEvolution } from './map/CastleEvolution.js';
import { TownPortal } from './map/TownPortal.js';
import { StagnationTracker, classifyTaskHealth, classifyWorkloads } from './data/HealthSignals.js';
import { TaskPopup } from './ui/TaskPopup.js';

// ─── Spawn Sequencer ─────────────────────────────────────────────────────────
// Drives the "characters emerging from the base" intro sequence.
// Each entity: door opens → entity walks out → door closes → next

const EMERGE_DISTANCE = 2.0;    // tiles to walk out from door
const EMERGE_SPEED = 3.0;       // tiles/sec while walking out

class SpawnSequencer {
  /**
   * @param {Base} base
   * @param {{x:number, z:number}} worldOffset — grid-to-scene offset
   */
  constructor(base, worldOffset) {
    this._base = base;
    this._offset = worldOffset;
    this._queue = [];       // { group, onSpawned, type }
    this._currentIndex = 0;
    this._state = 'idle';   // idle | door_opening | emerging | door_closing
    this._timer = 0;
    this._emergeStart = null;
    this._emergeEnd = null;
    this._done = false;
    this._gateCount = base.getGateCount();
    this._currentGate = 0;
    this._exitPositions = base.getDoorExitPositions();
  }

  /**
   * Add an entity to the spawn queue.
   * @param {THREE.Group} group — the entity's 3D group
   * @param {Function} onSpawned — called when entity finishes emerging
   * @param {'person'|'animal'} type
   */
  addEntity(group, onSpawned, type = 'person') {
    this._queue.push({ group, onSpawned, type });
  }

  isDone() { return this._done; }

  update(dt) {
    if (this._done) return;

    // Nothing in queue
    if (this._queue.length === 0) {
      this._done = true;
      return;
    }

    // All spawned
    if (this._currentIndex >= this._queue.length) {
      // Wait for current gate door to close after last entity
      if (this._state === 'door_closing') {
        this._base.closeGate(dt, this._currentGate);
        if (this._base.isGateClosed(this._currentGate)) {
          this._state = 'idle';
          this._done = true;
        }
      } else {
        this._done = true;
      }
      return;
    }

    const entry = this._queue[this._currentIndex];
    const gi = this._currentGate;
    const exitPos = this._exitPositions[gi];
    const sceneExit = {
      x: exitPos.x + this._offset.x,
      z: exitPos.z + this._offset.z,
    };

    // Emerge direction: outward from castle center
    const castleCenterScene = {
      x: this._base.worldX + this._offset.x,
      z: this._base.worldZ + this._offset.z,
    };
    const edx = sceneExit.x - castleCenterScene.x;
    const edz = sceneExit.z - castleCenterScene.z;
    const elen = Math.sqrt(edx * edx + edz * edz) || 1;
    const emergeDirX = edx / elen;
    const emergeDirZ = edz / elen;

    switch (this._state) {
      case 'idle':
        // Start opening gate for next entity
        this._state = 'door_opening';
        entry.group.position.set(sceneExit.x, 0, sceneExit.z);
        entry.group.visible = false;
        break;

      case 'door_opening':
        this._base.openGate(dt, gi);
        if (this._base.isGateOpen(gi)) {
          this._state = 'emerging';
          entry.group.visible = true;
          entry.group.position.set(sceneExit.x, 0, sceneExit.z);
          this._emergeStart = { x: sceneExit.x, z: sceneExit.z };
          this._emergeEnd = {
            x: sceneExit.x + emergeDirX * EMERGE_DISTANCE,
            z: sceneExit.z + emergeDirZ * EMERGE_DISTANCE,
          };
          this._timer = 0;
        }
        break;

      case 'emerging': {
        this._timer += dt;
        const emergeDuration = EMERGE_DISTANCE / EMERGE_SPEED;
        const t = Math.min(1, this._timer / emergeDuration);

        entry.group.position.x = this._emergeStart.x + (this._emergeEnd.x - this._emergeStart.x) * t;
        entry.group.position.z = this._emergeStart.z + (this._emergeEnd.z - this._emergeStart.z) * t;
        entry.group.position.y = 0;

        if (t >= 1) {
          if (entry.onSpawned) entry.onSpawned();
          this._currentIndex++;
          this._state = 'door_closing';
          this._timer = 0;
        }
        break;
      }

      case 'door_closing':
        this._base.closeGate(dt, gi);
        this._timer += dt;
        if (this._base.isGateClosed(gi) || this._timer > 0.4) {
          // Cycle to next gate
          this._currentGate = (this._currentGate + 1) % this._gateCount;
          this._state = 'idle';
        }
        break;
    }
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  // Register default model providers (procedural primitives).
  // To swap in glTF models, register overrides after this call.
  registerDefaultModels();

  const canvas = document.getElementById('scene');
  const uiRoot = document.getElementById('ui-root');
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Scene ---
  const sceneManager = new SceneManager(canvas);
  const scene = sceneManager.getScene();
  const camera = sceneManager.getCamera();
  const renderer = sceneManager.getRenderer();

  // --- Data (load saved settings before creating adapter) ---
  const savedSettings = SettingsPanel.loadSettings();
  if (savedSettings.dataSource) CONFIG.DATA_SOURCE = savedSettings.dataSource;
  if (savedSettings.sheetId) CONFIG.GOOGLE_SHEET_ID = savedSettings.sheetId;

  let adapter = CONFIG.DATA_SOURCE === 'google-sheets'
    ? new GoogleSheetsAdapter()
    : new SeedAdapter();
  const store = new Store(adapter);
  await store.syncFromAdapter();

  // --- Grid + Terrain (v2: fan-shaped biome map) ---
  const mapSize = CONFIG.MAP_SIZE;
  const grid = new GameGrid(mapSize, mapSize);
  const biomeTerrainGen = new BiomeTerrainGenerator();
  const mapInfo = biomeTerrainGen.generate(grid);

  // Place resource nodes from tasks (positioned by biome/stage)
  const tasks = store.getTasks();
  const resourceNodePositions = biomeTerrainGen.placeResourceNodes(grid, tasks);

  // Place structures from milestones
  const milestones = store.getMilestones();
  const structurePositions = biomeTerrainGen.placeStructures(grid, milestones);

  // --- Map renderer (no textures — flat matte colors) ---
  const gameMap = new GameMap(grid, null);
  const offset = gameMap.centerOffset();
  gameMap.getGroup().position.set(offset.x, 0, offset.z);
  scene.add(gameMap.getGroup());

  // Add resource node visuals (sized by task size)
  for (const node of resourceNodePositions) {
    const color = resourceColorForCategory(node.resourceType);
    gameMap.addResourceNode(node.taskId, node.col, node.row, color, node.size || 'medium');
    if (node.depleted) gameMap.setResourceNodeDepleted(node.taskId);
  }

  // Add structure visuals
  for (const sp of structurePositions) {
    const ms = store.getMilestone(sp.milestoneId);
    gameMap.addStructure(sp.milestoneId, sp.col, sp.row);
    if (ms) {
      const progress = computeStructureProgress(ms, store.getTasks());
      gameMap.setStructureProgress(sp.milestoneId, progress);
    }
  }

  // --- Fog of War ---
  const fog = new FogOfWar(grid);
  fog.getGroup().position.set(offset.x, 0, offset.z);
  scene.add(fog.getGroup());

  // Reveal base area (castle is at left side in v2 fan layout)
  const castleCol = mapInfo.castleCol;
  const castleRow = mapInfo.castleRow;
  fog.revealRadius(castleCol, castleRow, CONFIG.BASE_RADIUS + 8);

  // --- Base ---
  const base = new Base(grid, castleCol, castleRow, CONFIG.BASE_RADIUS);
  base.getGroup().position.set(offset.x, 0, offset.z);
  scene.add(base.getGroup());

  // Block castle wall tiles — square layout matching Base.js geometry
  // Walls are straight segments at wallOffset from center, not a circular ring
  const wo = CONFIG.BASE_RADIUS * 0.7; // wallOffset from Base.js
  const wallTileInner = Math.floor(wo);  // inner tile line
  const wallTileOuter = Math.ceil(wo);   // outer tile line
  const wallExtent = wallTileOuter;      // wall runs ±wallExtent from center
  const gateHalf = 1;                    // gate corridor: 1 tile wide

  // Block tiles along the 4 wall lines (2 tiles thick where fractional)
  const wallLines = [wallTileInner];
  if (wallTileOuter !== wallTileInner) wallLines.push(wallTileOuter);

  for (const w of wallLines) {
    for (let i = -wallExtent; i <= wallExtent; i++) {
      // N/S walls (horizontal): skip gate at dx=0
      if (Math.abs(i) >= gateHalf) {
        grid.setTile(castleCol + i, castleRow + w, { blocked: true });
        grid.setTile(castleCol + i, castleRow - w, { blocked: true });
      }
      // E/W walls (vertical): skip gate at dz=0
      if (Math.abs(i) >= gateHalf) {
        grid.setTile(castleCol + w, castleRow + i, { blocked: true });
        grid.setTile(castleCol - w, castleRow + i, { blocked: true });
      }
    }
  }

  // Block central keep (2×2 footprint → 3×3 tile area)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      grid.setTile(castleCol + dc, castleRow + dr, { blocked: true });
    }
  }

  // --- Castle Evolution (gem treasury + visual upgrades) ---
  const castleWorldPos = grid.tileToWorld(castleCol, castleRow);
  const castleEvolution = new CastleEvolution(base, castleWorldPos.x, castleWorldPos.z, CONFIG.BASE_RADIUS);
  castleEvolution.getGemGroup().position.set(offset.x, 0, offset.z);
  scene.add(castleEvolution.getGemGroup());

  // Initialize with current completed task count
  const completedCount = store.getTasks().filter(t => t.percentComplete >= 100).length;
  castleEvolution.update(completedCount);

  // --- Town Portal (completion animation) ---
  const castleWorldWithOffset = {
    x: castleWorldPos.x + offset.x,
    z: castleWorldPos.z + offset.z,
  };
  const townPortal = new TownPortal(scene, castleWorldWithOffset.x, castleWorldWithOffset.z);

  // --- Camera controls ---
  const bounds = gameMap.getBounds();
  const adjustedBounds = {
    minX: bounds.minX + offset.x,
    maxX: bounds.maxX + offset.x,
    minZ: bounds.minZ + offset.z,
    maxZ: bounds.maxZ + offset.z,
    centerX: bounds.centerX + offset.x,
    centerZ: bounds.centerZ + offset.z,
  };
  const cameraControls = new CameraControls(camera, renderer, adjustedBounds);

  // --- Units (all start hidden — spawn sequencer reveals them) ---
  const unitManager = new UnitManager(scene, grid, gameMap, fog, store, base);
  unitManager.setCamera(camera);
  unitManager.setWorldOffset(offset);
  unitManager.setResourceNodePositions(resourceNodePositions);
  unitManager.setStructurePositions(structurePositions);
  unitManager.refresh();

  // --- Animals (all start hidden — spawn sequencer reveals them) ---
  const animalManager = new AnimalManager(scene, grid, offset);
  animalManager.setDoorExitPositions(base.getDoorExitPositions());
  animalManager.spawn(); // 5-8 random cats, dogs, penguins

  // --- Spawn Sequencer ---
  const spawnSequencer = new SpawnSequencer(base, offset);

  // Queue people first, then animals
  const avatarList = unitManager.getAvatarList();
  for (const { personId, avatar } of avatarList) {
    spawnSequencer.addEntity(avatar.group, () => {
      unitManager.markSpawned(personId);
    }, 'person');
  }

  const animalList = animalManager.getAnimalList();
  for (const { index, group } of animalList) {
    spawnSequencer.addEntity(group, () => {
      animalManager.markSpawned(index);
    }, 'animal');
  }

  // --- Day/Night continuous 24-hour cycle ---
  // 5 real seconds = 1 sim hour, full cycle = 24 hours = 120 seconds = 2 minutes
  let simHour = 6;                       // start at 6:00 AM
  const HOUR_RATE = 1 / 5;              // 1 sim hour per 5 real seconds

  /**
   * Convert 24-hour sim clock to lighting t (0 = full day, 1 = full night).
   * Uses a cosine curve: noon (12) → t=0, midnight (0/24) → t=1.
   */
  function hourToLightingT(hour) {
    // cos curve: hour 12 → cos(0) = 1 → t=0; hour 0/24 → cos(π) = -1 → t=1
    return (1 - Math.cos(((hour - 12) / 12) * Math.PI)) / 2;
  }

  function applyTimeOfDay(t, hour) {
    sceneManager.setTimeOfDay(t);
    unitManager.setTimeOfDay(t);
    base.setTimeOfDay(t);
    gameMap.setTimeOfDay(t);

    // Fog color interpolation
    const dFog = THEME.fog.color;
    const nFog = THEME_NIGHT.fog.color;
    const fogR = Math.round(dFog.r + (nFog.r - dFog.r) * t);
    const fogG = Math.round(dFog.g + (nFog.g - dFog.g) * t);
    const fogB = Math.round(dFog.b + (nFog.b - dFog.b) * t);
    fog.setFogColor(fogR, fogG, fogB);

    if (toolbar) toolbar.setTimeDisplay(hour);
  }

  // --- Render loop (start early so scene is always live) ---
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    cameraControls.update(dt);

    // Continuous 24-hour cycle (wraps at 24 → 0)
    simHour = (simHour + HOUR_RATE * dt) % 24;
    applyTimeOfDay(hourToLightingT(simHour), simHour);

    // Drive the spawn intro sequence
    if (!spawnSequencer.isDone()) {
      spawnSequencer.update(dt);
    }

    unitManager.update(dt);
    animalManager.update(dt, unitManager.getScenePositions());
    gameMap.update(dt);
    fog.update(dt);
    castleEvolution.animateGems(dt);
    townPortal.update(dt);
    if (structurePopup) structurePopup.updatePosition();
    if (taskPopup) taskPopup.updatePosition();
    sceneManager.render();
  }

  requestAnimationFrame(animate);

  // --- Interaction ---
  let raycaster, tooltip, detailPanel, structurePopup, taskPopup, toolbar, editorPanel;
  try {
    raycaster = new Raycaster(camera, renderer, unitManager, gameMap);
    tooltip = new Tooltip(uiRoot);

    // --- UI ---
    detailPanel = new DetailPanel(uiRoot, store);
    detailPanel.setUnitManager(unitManager);
    structurePopup = new StructurePopup(uiRoot, store);
    structurePopup.setCamera(camera);
    taskPopup = new TaskPopup(uiRoot, store);
    taskPopup.setCamera(camera);
    toolbar = new Toolbar(uiRoot);
    editorPanel = new EditorPanel(uiRoot, store);

    // Wire events — jump 12 hours forward
    toolbar.onToggleDayNight(() => {
      simHour = (simHour + 12) % 24;
    });

    const settingsPanel = new SettingsPanel(uiRoot, {
      onSave: async (settings) => {
        const newAdapter = settings.dataSource === 'google-sheets'
          ? new GoogleSheetsAdapter()
          : new SeedAdapter();
        store.setAdapter(newAdapter);
        try {
          await store.syncFromAdapter();
          settingsPanel.showSyncResult(true);
        } catch {
          settingsPanel.showSyncResult(false);
        }
      },
    });

    toolbar.onToggleSettings(() => settingsPanel.toggle());
    toolbar.onToggleEditor(() => editorPanel.toggle());

    raycaster.onAvatarClick((personId) => {
      if (structurePopup) structurePopup.close();
      if (taskPopup) taskPopup.close();
      detailPanel.open(personId);
    });
    raycaster.onStructureClick((milestoneId) => {
      if (taskPopup) taskPopup.close();
      const pos = gameMap.getStructureWorldPosition(milestoneId);
      if (pos && structurePopup) {
        structurePopup.open(milestoneId, pos.x + offset.x, pos.z + offset.z);
      }
    });
    raycaster.onResourceClick((taskId) => {
      if (structurePopup) structurePopup.close();
      const pos = gameMap.getResourceNodeWorldPosition(taskId);
      if (pos && taskPopup) {
        taskPopup.open(taskId, pos.x + offset.x, pos.z + offset.z);
      }
    });
    structurePopup.onPersonClick((pid) => {
      structurePopup.close();
      detailPanel.open(pid);
    });
    taskPopup.onPersonClick((pid) => {
      taskPopup.close();
      detailPanel.open(pid);
    });

    raycaster.onAvatarHover((personId, screenPos) => {
      if (personId) {
        const person = store.getPerson(personId);
        if (person) tooltip.show(person.name, screenPos.x, screenPos.y);
      } else {
        tooltip.hide();
      }
    });
  } catch (err) {
    console.error('[boot] UI init error:', err);
  }

  // Track task stages and completion to detect changes
  const taskStageCache = new Map();
  const taskCompletionCache = new Map(); // taskId → boolean (was already 100%?)
  let gemIndexCounter = completedCount; // for cycling gem colors; start after initial gems
  for (const task of tasks) {
    taskStageCache.set(task.id, task.stage || null);
    taskCompletionCache.set(task.id, (task.percentComplete || 0) >= 100);
  }

  // --- Health signals (stagnation + deadline) ---
  const stagnationTracker = new StagnationTracker(CONFIG.STAGNATION_DAYS);
  stagnationTracker.update(tasks);

  // Apply initial health states to resource nodes
  const warningDays = CONFIG.DEADLINE_WARNING_DAYS;
  const workloadCapacity = CONFIG.WORKLOAD_CAPACITY;
  for (const task of tasks) {
    const health = classifyTaskHealth(task, stagnationTracker, new Date(), warningDays);
    gameMap.setResourceNodeHealthState(task.id, health);
  }

  // Workload tracking (recomputed on every change)
  let workloadMap = classifyWorkloads(tasks, store.getPeople(), workloadCapacity);

  // Set health/workload providers on UI panels
  const healthProvider = (taskId) => {
    const task = store.getTask(taskId);
    if (!task) return 'healthy';
    return classifyTaskHealth(task, stagnationTracker, new Date(), warningDays);
  };
  const daysInStageProvider = (taskId) => stagnationTracker.daysInStage(taskId);
  const workloadProvider = (personId) => workloadMap.get(personId) || { state: 'normal', activeCount: 0, capacity: workloadCapacity };

  if (detailPanel) detailPanel.setHealthProviders(healthProvider, workloadProvider);
  if (taskPopup) taskPopup.setHealthProviders(healthProvider, daysInStageProvider);

  store.on('change', () => {
    unitManager.refresh();
    if (detailPanel) detailPanel.refresh();
    if (structurePopup) structurePopup.refresh();
    if (taskPopup) taskPopup.refresh();

    // Update structure progress
    for (const sp of structurePositions) {
      const ms = store.getMilestone(sp.milestoneId);
      if (ms) {
        const progress = computeStructureProgress(ms, store.getTasks());
        gameMap.setStructureProgress(sp.milestoneId, progress);
      }
    }

    // Detect newly completed tasks → trigger town portal animation
    for (const task of store.getTasks()) {
      const wasComplete = taskCompletionCache.get(task.id) || false;
      const isComplete = (task.percentComplete || 0) >= 100;

      if (isComplete && !wasComplete && !townPortal.isActive(task.id)) {
        // Get the marker's world position (accounting for scene offset)
        const nodePos = gameMap.getResourceNodeWorldPosition(task.id);
        if (nodePos) {
          const worldX = nodePos.x + offset.x;
          const worldZ = nodePos.z + offset.z;
          const gemIdx = gemIndexCounter++;

          townPortal.trigger(
            task.id,
            worldX,
            worldZ,
            gemIdx,
            // onMarkerHide — permanently deplete the resource node
            () => {
              gameMap.depleteNode(task.id, /* permanent */ true);
            },
            // onComplete — gem has arrived at castle; update evolution + remove marker
            () => {
              gameMap.removeResourceNode(task.id);
              // Recount completed tasks (including this one) for castle evolution
              const currentCompleted = store.getTasks().filter(t => (t.percentComplete || 0) >= 100).length;
              castleEvolution.update(currentCompleted);
            }
          );
        }
      }
      taskCompletionCache.set(task.id, isComplete);
    }

    // Update castle evolution for non-portal tasks (tasks that were already
    // complete at load time, or completed tasks whose portal has finished).
    // Portal-active tasks will update the castle when their flight completes.
    if (townPortal.activeCount === 0) {
      const newCompletedCount = store.getTasks().filter(t => (t.percentComplete || 0) >= 100).length;
      castleEvolution.update(newCompletedCount);
    }

    // Detect task stage changes and relocate resource nodes to new biome
    for (const task of store.getTasks()) {
      const prevStage = taskStageCache.get(task.id);
      const newStage = task.stage || null;
      if (prevStage !== newStage && newStage) {
        // Don't relocate completed/portal-active tasks
        if ((task.percentComplete || 0) >= 100 || townPortal.isActive(task.id)) {
          taskStageCache.set(task.id, newStage);
          continue;
        }
        // Recalculate position for the new biome
        const newPositions = biomeTerrainGen.placeResourceNodes(grid, [task]);
        if (newPositions.length > 0) {
          const np = newPositions[0];
          gameMap.relocateResourceNode(task.id, np.col, np.row);
          // Update unit manager's resource positions
          unitManager.setResourceNodePositions([{ taskId: task.id, col: np.col, row: np.row }]);
        }
      }
      taskStageCache.set(task.id, newStage);
    }

    // Recompute health signals for all active tasks
    const currentTasks = store.getTasks();
    stagnationTracker.update(currentTasks);
    workloadMap = classifyWorkloads(currentTasks, store.getPeople(), workloadCapacity);
    const now = new Date();
    for (const task of currentTasks) {
      if ((task.percentComplete || 0) >= 100 || townPortal.isActive(task.id)) continue;
      const health = classifyTaskHealth(task, stagnationTracker, now, warningDays);
      gameMap.setResourceNodeHealthState(task.id, health);
    }
  });

  // Periodic sync from external data source
  if (CONFIG.DATA_SOURCE !== 'seed' && CONFIG.SYNC_INTERVAL_MS > 0) {
    setInterval(async () => {
      await store.syncFromAdapter();
    }, CONFIG.SYNC_INTERVAL_MS);
  }
}

boot().catch(err => console.error('[boot] Fatal:', err));
