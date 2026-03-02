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
   * Add a task flag visual.
   * @param {string} taskId
   * @param {number} col
   * @param {number} row
   * @param {number} color — flag cloth color
   * @param {string} [size='medium'] — 'small', 'medium', or 'large'
   */
  addResourceNode(taskId, col, row, color, size = 'medium') {
    const world = this.grid.tileToWorld(col, row);
    const nodeGroup = new THREE.Group();
    // Position group at world coords so scale/wobble animates around flag center
    nodeGroup.position.set(world.x, 0, world.z);

    // Scale factor based on task size
    const sizeScale = size === 'large' ? 1.5 : size === 'small' ? 0.65 : 1.0;
    const poleHeight = 0.8 * sizeScale;

    // Flag pole (thin cylinder) — positions relative to group
    const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, poleHeight, 6);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
      metalness: 0.1,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, poleHeight / 2, 0);
    pole.castShadow = true;
    nodeGroup.add(pole);

    // Flag cloth (flat plane hanging from top of pole) — positions relative to group
    const flagWidth = 0.3 * sizeScale;
    const flagHeight = 0.2 * sizeScale;
    const flagGeo = new THREE.PlaneGeometry(flagWidth, flagHeight);
    const flagMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(flagWidth / 2 + 0.02, poleHeight - flagHeight / 2, 0);
    flag.castShadow = true;
    flag.userData.taskId = taskId;
    flag.userData.isResourceNode = true;
    flag.userData.size = size;
    flag.userData.originalColor = color;
    nodeGroup.add(flag);

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
    group.position.set(world.x, 0, world.z);
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
    return { x: group.position.x, z: group.position.z };
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
            // healthy — restore original task color
            child.material.color.set(child.userData.originalColor || THEME.resourceNodes.marker.color);
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
          // Flag cloth — restore original task color
          child.material.color.set(child.userData.originalColor || THEME.resourceNodes.marker.color);
          child.material.opacity = 1;
          child.material.transparent = false;
        } else {
          // Pole — restore brown
          child.material.color.set(0x8b7355);
          child.material.opacity = 1;
          child.material.transparent = false;
        }
      }
    });
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

  update(dt) {
    this._time += dt;

    // Rotation + health-based animation on resource node markers
    const healthTheme = THEME.resourceNodes.health;
    for (const [taskId, group] of this._resourceNodeGroups) {
      if (!group.visible) continue;
      const health = this._nodeHealthState.get(taskId) || 'healthy';

      group.traverse(child => {
        if (!child.isMesh || !child.userData.isResourceNode) return;

        // Gentle flag sway (oscillate rotation around Z axis)
        const swaySpeed = health === 'stagnant' ? 0.5 : 1.5;
        const swayAmount = health === 'stagnant' ? 0.03 : 0.08;
        child.rotation.z = Math.sin(this._time * swaySpeed + group.position.x * 3) * swayAmount;

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
