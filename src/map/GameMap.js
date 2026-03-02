import * as THREE from 'three';
import { TileType } from './GameGrid.js';
import { THEME } from '../utils/Theme.js';

const TILE_COLORS = {
  [TileType.GRASS]:  THEME.terrain.tiles.grass,
  [TileType.DIRT]:   THEME.terrain.tiles.dirt,
  [TileType.STONE]:  THEME.terrain.tiles.stone,
  [TileType.WATER]:  THEME.terrain.tiles.water,
  [TileType.FOREST]: THEME.terrain.tiles.forest,
};

/**
 * Get a biome-tinted color for a tile.
 * Blends the base tile color with the biome's primary color.
 */
function getBiomeTintedColor(tileType, biome) {
  const baseColor = TILE_COLORS[tileType] || THEME.terrain.fallbackColor;
  if (!biome || !THEME.biomes || !THEME.biomes[biome]) return baseColor;

  const biomeColor = THEME.biomes[biome].primary;

  // Blend: 60% base tile color + 40% biome tint
  const base = new THREE.Color(baseColor);
  const tint = new THREE.Color(biomeColor);
  base.lerp(tint, 0.4);
  return base.getHex();
}

// Resource node animation timing
const DEPLETE_DURATION = 0.5;   // seconds to shrink away
const REGROW_DELAY = 60;        // seconds before regrowing starts (very slow)
const REGROW_DURATION = 15;     // seconds to scale back up

export class GameMap {
  constructor(gameGrid, textures = null) {
    this.grid = gameGrid;
    this.group = new THREE.Group();
    this._tileMeshes = new Map();
    this._resourceNodeGroups = new Map();
    this._structureGroups = new Map();
    this._structureLanterns = new Map(); // milestoneId → { light, mesh }
    this._structureProgress = new Map(); // milestoneId → progress (0-1)
    this._nodeAnimState = new Map(); // taskId → { phase, timer, permanent }
    this._nodeHealthState = new Map(); // taskId → 'healthy'|'stagnant'|'atRisk'|'overdue'
    this._textures = textures;
    this._waterMaterial = null;
    this._time = 0;

    this._buildTerrain();
  }

  _buildTerrain() {
    const tileGeo = new THREE.PlaneGeometry(1, 1);
    tileGeo.rotateX(-Math.PI / 2);

    // Group tiles by type+biome combination for biome-tinted rendering.
    // Falls back to type-only grouping if tiles have no biome set (v1 compat).
    const byGroup = {};
    for (let row = 0; row < this.grid.height; row++) {
      for (let col = 0; col < this.grid.width; col++) {
        const tile = this.grid.getTile(col, row);
        if (tile.type === TileType.VOID) continue;
        const groupKey = tile.biome ? `${tile.type}:${tile.biome}` : tile.type;
        if (!byGroup[groupKey]) byGroup[groupKey] = { type: tile.type, biome: tile.biome, tiles: [] };
        byGroup[groupKey].tiles.push({ col, row });
      }
    }

    for (const group of Object.values(byGroup)) {
      const { type, biome, tiles } = group;
      const texture = this._textures ? this._textures[type] : null;
      const color = texture ? 0xffffff : getBiomeTintedColor(type, biome);
      const mat = new THREE.MeshStandardMaterial({
        color,
        map: texture || null,
        roughness: THEME.terrain.material.roughness,
        metalness: THEME.terrain.material.metalness,
      });
      if (type === TileType.WATER && !this._waterMaterial) this._waterMaterial = mat;

      const instanced = new THREE.InstancedMesh(tileGeo, mat, tiles.length);
      instanced.receiveShadow = true;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < tiles.length; i++) {
        const { col, row } = tiles[i];
        const world = this.grid.tileToWorld(col, row);
        const y = type === TileType.WATER ? -0.08 : 0;
        dummy.position.set(world.x, y, world.z);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      this.group.add(instanced);
    }

    // Architectural maquette trees (sphere on stick)
    for (let row = 0; row < this.grid.height; row++) {
      for (let col = 0; col < this.grid.width; col++) {
        const tile = this.grid.getTile(col, row);
        if (tile.type === TileType.FOREST) {
          this._addTree(col, row);
        }
      }
    }
  }

  _addTree(col, row) {
    const world = this.grid.tileToWorld(col, row);

    // Thin dowel trunk
    const trunkGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: THEME.trees.trunk.color,
      roughness: THEME.trees.trunk.roughness,
      metalness: THEME.trees.trunk.metalness,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(world.x, 0.25, world.z);
    trunk.castShadow = true;

    // Sphere crown — like foam ball on architectural model
    const crownGeo = new THREE.SphereGeometry(0.22, 12, 8);
    const crownMat = new THREE.MeshStandardMaterial({
      color: THEME.trees.crown.color,
      roughness: THEME.trees.crown.roughness,
      metalness: THEME.trees.crown.metalness,
    });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(world.x, 0.6, world.z);
    crown.castShadow = true;

    this.group.add(trunk);
    this.group.add(crown);
  }

  /**
   * Add a resource node visual for a task.
   * @param {string} taskId
   * @param {number} col
   * @param {number} row
   * @param {number} color
   * @param {string} [size='medium'] — 'small', 'medium', or 'large'
   */
  addResourceNode(taskId, col, row, color, size = 'medium') {
    const world = this.grid.tileToWorld(col, row);
    const nodeGroup = new THREE.Group();

    // Scale factor based on task size
    const sizeScale = size === 'large' ? 1.5 : size === 'small' ? 0.65 : 1.0;

    // Abstract geometric marker — icosahedron on pedestal
    const markerGeo = new THREE.IcosahedronGeometry(0.18 * sizeScale, 0);
    const markerMat = new THREE.MeshStandardMaterial({
      color: THEME.resourceNodes.marker.color,
      roughness: THEME.resourceNodes.marker.roughness,
      metalness: THEME.resourceNodes.marker.metalness,
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(world.x, 0.35 * sizeScale, world.z);
    marker.castShadow = true;
    marker.userData.taskId = taskId;
    marker.userData.isResourceNode = true;
    marker.userData.size = size;
    nodeGroup.add(marker);

    // Pedestal scales with marker
    const pedestalGeo = new THREE.CylinderGeometry(0.12 * sizeScale, 0.14 * sizeScale, 0.15 * sizeScale, 6);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: THEME.resourceNodes.pedestal.color,
      roughness: THEME.resourceNodes.pedestal.roughness,
      metalness: THEME.resourceNodes.pedestal.metalness,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.set(world.x, 0.075 * sizeScale, world.z);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    nodeGroup.add(pedestal);

    nodeGroup.visible = false;
    this.group.add(nodeGroup);
    this._resourceNodeGroups.set(taskId, nodeGroup);
    return nodeGroup;
  }

  setResourceNodeVisible(taskId, visible) {
    const group = this._resourceNodeGroups.get(taskId);
    if (group) group.visible = visible;
  }

  /**
   * Relocate a resource node to a new grid position.
   * Used when a task changes stage and needs to move to a different biome.
   * @param {string} taskId
   * @param {number} col — new grid column
   * @param {number} row — new grid row
   */
  relocateResourceNode(taskId, col, row) {
    const group = this._resourceNodeGroups.get(taskId);
    if (!group) return;

    const world = this.grid.tileToWorld(col, row);

    // Move all children's positions relative to the new world position
    group.traverse(child => {
      if (child.isMesh) {
        if (child.userData.isResourceNode) {
          // Marker — reposition to new world coords, keep Y
          child.position.x = world.x;
          child.position.z = world.z;
        } else {
          // Pedestal
          child.position.x = world.x;
          child.position.z = world.z;
        }
      }
    });
  }

  setResourceNodeDepleted(taskId) {
    // Used at load time for tasks already at 100% — immediate permanent depletion
    const group = this._resourceNodeGroups.get(taskId);
    if (!group) return;
    group.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.color.set(THEME.resourceNodes.depleted.color);
        child.material.opacity = THEME.resourceNodes.depleted.opacity;
        child.material.transparent = true;
      }
    });
    group.scale.set(0, 0, 0);
    this._nodeAnimState.set(taskId, { phase: 'depleted', timer: 0, permanent: true });
  }

  /**
   * Trigger resource node depletion animation (shrink away on pickup).
   * @param {string} taskId
   * @param {boolean} permanent - if true, node never regrows (task 100%)
   */
  depleteNode(taskId, permanent = false) {
    const state = this._nodeAnimState.get(taskId);
    // Don't re-deplete if already depleting/depleted
    if (state && state.phase !== 'available') return;
    this._nodeAnimState.set(taskId, { phase: 'depleting', timer: 0, permanent });
  }

  /**
   * Returns true if the resource node is available for gathering.
   */
  isNodeAvailable(taskId) {
    const state = this._nodeAnimState.get(taskId);
    if (!state) return true; // no state = never depleted = available
    return state.phase === 'available';
  }

  /**
   * Get the world position of a resource node's marker.
   * @param {string} taskId
   * @returns {{x: number, z: number}|null}
   */
  getResourceNodeWorldPosition(taskId) {
    const group = this._resourceNodeGroups.get(taskId);
    if (!group) return null;
    let pos = null;
    group.traverse(child => {
      if (child.isMesh && child.userData.isResourceNode && !pos) {
        pos = { x: child.position.x, z: child.position.z };
      }
    });
    return pos;
  }

  /**
   * Fully remove a resource node from the scene graph and internal maps.
   * Used after portal completion animation is done.
   * @param {string} taskId
   */
  removeResourceNode(taskId) {
    const group = this._resourceNodeGroups.get(taskId);
    if (!group) return;

    // Dispose geometries and materials
    group.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    });

    this.group.remove(group);
    this._resourceNodeGroups.delete(taskId);
    this._nodeAnimState.delete(taskId);
    this._nodeHealthState.delete(taskId);
  }

  /**
   * Set the health state of a resource node for visual treatment.
   * Called from the health signal system on every store change.
   * @param {string} taskId
   * @param {'healthy'|'stagnant'|'atRisk'|'overdue'} state
   */
  setResourceNodeHealthState(taskId, state) {
    const prev = this._nodeHealthState.get(taskId);
    if (prev === state) return; // no change

    this._nodeHealthState.set(taskId, state);

    const group = this._resourceNodeGroups.get(taskId);
    if (!group) return;

    // Apply immediate material changes based on health state
    const healthTheme = THEME.resourceNodes.health;

    group.traverse(child => {
      if (!child.isMesh || !child.material) return;

      if (child.userData.isResourceNode) {
        // Marker mesh — apply health-specific appearance
        switch (state) {
          case 'stagnant': {
            const h = healthTheme.stagnant;
            child.material.color.set(h.color);
            child.material.emissive.set(h.emissive);
            child.material.emissiveIntensity = h.emissiveIntensity;
            child.material.opacity = h.opacity;
            child.material.transparent = true;
            break;
          }
          case 'atRisk': {
            const h = healthTheme.atRisk;
            child.material.color.set(h.color);
            child.material.emissive.set(h.emissive);
            child.material.emissiveIntensity = h.emissiveIntensity;
            child.material.opacity = 1;
            child.material.transparent = false;
            break;
          }
          case 'overdue': {
            const h = healthTheme.overdue;
            child.material.color.set(h.color);
            child.material.emissive.set(h.emissive);
            child.material.emissiveIntensity = h.emissiveIntensity;
            child.material.opacity = 1;
            child.material.transparent = false;
            break;
          }
          default: {
            // healthy — restore normal appearance
            child.material.color.set(THEME.resourceNodes.marker.color);
            child.material.emissive.set(0x000000);
            child.material.emissiveIntensity = 0;
            child.material.opacity = 1;
            child.material.transparent = false;
            break;
          }
        }
      }
    });
  }

  /**
   * Get the current health state of a resource node.
   * @param {string} taskId
   * @returns {'healthy'|'stagnant'|'atRisk'|'overdue'}
   */
  getResourceNodeHealthState(taskId) {
    return this._nodeHealthState.get(taskId) || 'healthy';
  }

  /**
   * Restore node appearance after regrowth (reset materials to original colors).
   */
  _restoreNodeAppearance(taskId) {
    const group = this._resourceNodeGroups.get(taskId);
    if (!group) return;
    group.traverse(child => {
      if (child.isMesh && child.material) {
        if (child.userData.isResourceNode) {
          // Marker — restore original color
          child.material.color.set(THEME.resourceNodes.marker.color);
          child.material.opacity = 1;
          child.material.transparent = false;
        } else {
          // Pedestal
          child.material.color.set(THEME.resourceNodes.pedestal.color);
          child.material.opacity = 1;
          child.material.transparent = false;
        }
      }
    });
  }

  addStructure(milestoneId, col, row) {
    const world = this.grid.tileToWorld(col, row);
    const structGroup = new THREE.Group();
    const S = THEME.structures.stages;

    // Base ring
    const ringGeo = new THREE.RingGeometry(0.6, 1.0, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: THEME.structures.base.color,
      transparent: true,
      opacity: THEME.structures.base.opacity,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(world.x, 0.01, world.z);
    ring.receiveShadow = true;
    structGroup.add(ring);

    // Foundation platform
    const foundGeo = new THREE.CylinderGeometry(0.7, 0.8, 0.1, 8);
    const foundMat = new THREE.MeshStandardMaterial({
      color: S.foundation.color,
      roughness: S.foundation.roughness,
      metalness: S.foundation.metalness,
    });
    const foundation = new THREE.Mesh(foundGeo, foundMat);
    foundation.position.set(world.x, 0.05, world.z);
    foundation.receiveShadow = true;
    structGroup.add(foundation);

    // Wireframe blueprint (walls + roof outline)
    const wireGroup = new THREE.Group();
    const wireWallGeo = new THREE.BoxGeometry(1.0, 0.8, 1.0);
    const wireMat = new THREE.MeshStandardMaterial({
      color: THEME.structures.wireframe.color,
      wireframe: true,
      transparent: true,
      opacity: THEME.structures.wireframe.opacity,
    });
    const wireWall = new THREE.Mesh(wireWallGeo, wireMat);
    wireWall.position.set(world.x, 0.5, world.z);
    wireWall.userData.milestoneId = milestoneId;
    wireWall.userData.isStructure = true;
    wireGroup.add(wireWall);

    const wireRoofGeo = new THREE.ConeGeometry(0.75, 0.5, 4);
    const wireRoof = new THREE.Mesh(wireRoofGeo, wireMat.clone());
    wireRoof.position.set(world.x, 1.15, world.z);
    wireRoof.rotation.y = Math.PI / 4;
    wireGroup.add(wireRoof);
    structGroup.add(wireGroup);

    // Solid walls
    const wallGeo = new THREE.BoxGeometry(1.0, 0.8, 1.0);
    const wallMat = new THREE.MeshStandardMaterial({
      color: S.walls.color,
      roughness: S.walls.roughness,
      metalness: S.walls.metalness,
      transparent: true,
      opacity: 0,
    });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.set(world.x, 0.5, world.z);
    walls.castShadow = true;
    walls.receiveShadow = true;
    walls.userData.milestoneId = milestoneId;
    walls.userData.isStructure = true;
    structGroup.add(walls);

    // Roof (cone, 4-sided pyramid)
    const roofGeo = new THREE.ConeGeometry(0.75, 0.5, 4);
    const roofMat = new THREE.MeshStandardMaterial({
      color: S.roof.color,
      roughness: S.roof.roughness,
      metalness: S.roof.metalness,
      transparent: true,
      opacity: 0,
      flatShading: true,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(world.x, 1.15, world.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    structGroup.add(roof);

    // Door (small box on front face)
    const doorGeo = new THREE.BoxGeometry(0.2, 0.35, 0.06);
    const doorMat = new THREE.MeshStandardMaterial({
      color: S.door.color,
      roughness: S.door.roughness,
      metalness: S.door.metalness,
      transparent: true,
      opacity: 0,
    });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(world.x, 0.28, world.z + 0.52);
    door.castShadow = true;
    structGroup.add(door);

    // Lantern (PointLight + small emissive mesh, hidden until night)
    const L = THEME.lantern;
    const lanternLight = new THREE.PointLight(
      L.structure.color, 0, L.structure.range, L.structure.decay
    );
    lanternLight.position.set(world.x, 1.8, world.z);
    lanternLight.castShadow = false;
    structGroup.add(lanternLight);

    const lanternGeo = new THREE.BoxGeometry(0.1, 0.15, 0.1);
    const lanternMat = new THREE.MeshStandardMaterial({
      color: L.mesh.color,
      emissive: L.mesh.emissive,
      emissiveIntensity: 0,
    });
    const lanternMesh = new THREE.Mesh(lanternGeo, lanternMat);
    lanternMesh.position.set(world.x, 1.6, world.z);
    lanternMesh.visible = false;
    structGroup.add(lanternMesh);

    this._structureLanterns.set(milestoneId, {
      light: lanternLight,
      mesh: lanternMesh,
      maxIntensity: L.structure.intensity,
    });

    // Store refs for animation
    structGroup.userData = {
      _wireGroup: wireGroup,
      _walls: walls,
      _roof: roof,
      _door: door,
      _foundation: foundation,
      _wx: world.x,
      _wz: world.z,
    };

    this.group.add(structGroup);
    this._structureGroups.set(milestoneId, structGroup);
    return structGroup;
  }

  setStructureProgress(milestoneId, progress) {
    this._structureProgress.set(milestoneId, progress);
    const group = this._structureGroups.get(milestoneId);
    if (!group) return;
    const d = group.userData;
    const wireGroup = d._wireGroup;
    const walls = d._walls;
    const roof = d._roof;
    const door = d._door;

    // Wireframe fades as progress increases
    wireGroup.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.opacity = THEME.structures.wireframe.opacity * (1 - progress);
      }
    });

    // Stage 1: 0-25% — Foundation + wireframe only
    if (progress < 0.25) {
      walls.material.opacity = 0;
      walls.scale.y = 0.01;
      roof.material.opacity = 0;
      door.material.opacity = 0;
      return;
    }

    // Stage 2: 25-50% — Walls rising
    if (progress < 0.5) {
      const t = (progress - 0.25) / 0.25; // 0→1 within stage
      walls.material.opacity = 0.3 + t * 0.5;
      walls.scale.y = 0.2 + t * 0.8;
      walls.position.y = 0.5 * walls.scale.y;
      roof.material.opacity = 0;
      door.material.opacity = 0;
      return;
    }

    // Stage 3: 50-75% — Walls complete, roof appearing
    if (progress < 0.75) {
      const t = (progress - 0.5) / 0.25;
      walls.material.opacity = 0.8 + t * 0.2;
      walls.scale.y = 1;
      walls.position.y = 0.5;
      roof.material.opacity = t * 0.9;
      roof.scale.set(t, t, t);
      roof.position.y = 0.9 + t * 0.25;
      door.material.opacity = 0;
      return;
    }

    // Stage 4: 75-100% — Door and details appear
    const t = (progress - 0.75) / 0.25;
    walls.material.opacity = 1;
    walls.scale.y = 1;
    walls.position.y = 0.5;
    roof.material.opacity = 0.9 + t * 0.1;
    roof.scale.set(1, 1, 1);
    roof.position.y = 1.15;
    door.material.opacity = t;

    // At 100%: golden completion glow
    if (progress >= 1) {
      walls.material.color.set(THEME.structures.complete.color);
      walls.material.emissive = new THREE.Color(THEME.structures.complete.emissiveColor);
      walls.material.emissiveIntensity = THEME.structures.complete.emissiveIntensity;
      roof.material.emissive = new THREE.Color(THEME.structures.complete.emissiveColor);
      roof.material.emissiveIntensity = THEME.structures.complete.emissiveIntensity * 0.5;
    }
  }

  getResourceNodePickables() {
    const pickables = [];
    for (const group of this._resourceNodeGroups.values()) {
      if (!group.visible) continue;
      group.traverse(child => {
        if (child.isMesh && child.userData.isResourceNode) {
          pickables.push(child);
        }
      });
    }
    return pickables;
  }

  getStructureWorldPosition(milestoneId) {
    const group = this._structureGroups.get(milestoneId);
    if (!group) return null;
    return { x: group.userData._wx, z: group.userData._wz };
  }

  getStructurePickables() {
    const pickables = [];
    for (const group of this._structureGroups.values()) {
      group.traverse(child => {
        if (child.isMesh && child.userData.isStructure) {
          pickables.push(child);
        }
      });
    }
    return pickables;
  }

  /**
   * Update structure lanterns for day/night cycle.
   * @param {number} t — 0 = day, 1 = night
   */
  setTimeOfDay(t) {
    const fadeStart = THEME.lantern.fadeStart;
    const raw = Math.max(0, Math.min(1, (t - fadeStart) / (1 - fadeStart)));
    const fade = raw * raw * (3 - 2 * raw); // smoothstep

    for (const [milestoneId, lantern] of this._structureLanterns) {
      // Only illuminate structures with roof built (progress >= 50%)
      const progress = this._structureProgress.get(milestoneId) || 0;
      const active = progress >= 0.5 ? fade : 0;

      lantern.light.intensity = lantern.maxIntensity * active;
      lantern.mesh.material.emissiveIntensity = active * 0.8;
      lantern.mesh.visible = active > 0;
    }
  }

  update(dt) {
    this._time += dt;

    // Rotation + health-based animation on resource node markers
    const healthTheme = THEME.resourceNodes.health;
    for (const [taskId, group] of this._resourceNodeGroups) {
      if (!group.visible) continue;
      const health = this._nodeHealthState.get(taskId) || 'healthy';

      group.traverse(child => {
        if (!child.isMesh || !child.userData.isResourceNode) return;

        // Rotation speed depends on health
        const rotSpeed = health === 'stagnant'
          ? (healthTheme.stagnant.rotationSpeed || 0.15)
          : 0.5;
        child.rotation.y += dt * rotSpeed;

        // Emissive pulsing for atRisk/overdue
        if (health === 'atRisk') {
          const h = healthTheme.atRisk;
          const pulse = h.emissiveIntensity + Math.sin(this._time * h.pulseSpeed * Math.PI * 2) * h.pulseAmplitude;
          child.material.emissiveIntensity = Math.max(0, pulse);
        } else if (health === 'overdue') {
          const h = healthTheme.overdue;
          const pulse = h.emissiveIntensity + Math.sin(this._time * h.pulseSpeed * Math.PI * 2) * h.pulseAmplitude;
          child.material.emissiveIntensity = Math.max(0, pulse);

          // Scale wobble for overdue (subtle instability feel)
          const wobble = 1 + Math.sin(this._time * h.wobbleSpeed * Math.PI * 2) * h.wobbleAmplitude;
          // Apply wobble to the group (not just marker) for cohesive feel
          // But only if group isn't being animated by depletion system
          const animState = this._nodeAnimState.get(taskId);
          if (!animState || animState.phase === 'available' || !animState.phase) {
            group.scale.set(wobble, wobble, wobble);
          }
        }
      });
    }

    // Resource node depletion / regrowth animations
    for (const [taskId, state] of this._nodeAnimState) {
      const group = this._resourceNodeGroups.get(taskId);
      if (!group) continue;

      switch (state.phase) {
        case 'depleting': {
          state.timer += dt;
          const t = Math.min(1, state.timer / DEPLETE_DURATION);
          const s = 1 - t;
          group.scale.set(s, s, s);
          group.position.y = 0;
          if (t >= 1) {
            state.phase = 'depleted';
            state.timer = 0;
            group.scale.set(0, 0, 0);
          }
          break;
        }
        case 'depleted': {
          if (state.permanent) break; // never regrow
          state.timer += dt;
          if (state.timer >= REGROW_DELAY) {
            state.phase = 'regrowing';
            state.timer = 0;
            group.scale.set(0.01, 0.01, 0.01);
            group.position.y = 0;
            this._restoreNodeAppearance(taskId);
          }
          break;
        }
        case 'regrowing': {
          state.timer += dt;
          const t = Math.min(1, state.timer / REGROW_DURATION);
          // Ease-out for gentle growth
          const s = 1 - Math.pow(1 - t, 2);
          group.scale.set(s, s, s);
          if (t >= 1) {
            state.phase = 'available';
            state.timer = 0;
            group.scale.set(1, 1, 1);
          }
          break;
        }
      }
    }

    // Gently scroll water texture
    if (this._waterMaterial && this._waterMaterial.map) {
      this._waterMaterial.map.offset.x += dt * 0.02;
      this._waterMaterial.map.offset.y += dt * 0.01;
    }
  }

  getGroup() { return this.group; }

  getBounds() {
    return {
      minX: 0,
      maxX: this.grid.width,
      minZ: 0,
      maxZ: this.grid.height,
      centerX: this.grid.width / 2,
      centerZ: this.grid.height / 2,
    };
  }

  centerOffset() {
    return { x: -this.grid.width / 2, z: -this.grid.height / 2 };
  }
}
