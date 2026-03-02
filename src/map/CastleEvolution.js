/**
 * CastleEvolution — manages castle level, gem treasury, and visual upgrades.
 *
 * The castle visually evolves as the team completes tasks:
 *   Level 0: Modest wooden fort with palisade (default Base appearance)
 *   Level 1: Stone walls replace wood, second tower appears (5 gems)
 *   Level 2: Full stone castle with courtyard, banners (10 gems)
 *   Level 3: Grand castle with multiple towers, stained glass (20 gems)
 *   Level 4: Fortress with golden accents, glowing treasury (35 gems)
 *
 * Gems are small glowing icosahedrons placed around the castle courtyard.
 */

import * as THREE from 'three';
import { THEME } from '../utils/Theme.js';

// Gem count thresholds for each castle level
const LEVEL_THRESHOLDS = [0, 5, 10, 20, 35];

// Visual properties for gems
const GEM_RADIUS = 0.12;
const GEM_COLORS = [
  0xE8443A, // ruby
  0x44A8E8, // sapphire
  0x44E870, // emerald
  0xE8C844, // topaz
  0xC844E8, // amethyst
  0xE8A044, // amber
];

// Material properties for castle level upgrades
const LEVEL_MATERIALS = {
  0: { color: 0x8B7355, roughness: 0.9, metalness: 0.0 },  // Wood
  1: { color: 0xA09585, roughness: 0.85, metalness: 0.05 }, // Simple stone
  2: { color: 0xB0A595, roughness: 0.8, metalness: 0.1 },   // Polished stone
  3: { color: 0xC0B5A5, roughness: 0.7, metalness: 0.15 },  // Refined stone
  4: { color: 0xD4C8A0, roughness: 0.5, metalness: 0.3 },   // Golden stone
};

export class CastleEvolution {
  /**
   * @param {Base} base — the castle Base instance
   * @param {number} cx — castle world X center
   * @param {number} cz — castle world Z center
   * @param {number} radius — castle base radius
   */
  constructor(base, cx, cz, radius) {
    this._base = base;
    this._cx = cx;
    this._cz = cz;
    this._radius = radius;
    this._level = 0;
    this._gemCount = 0;
    this._gemMeshes = [];
    this._gemGroup = new THREE.Group();
    this._bannerMeshes = [];

    // Place gem group at castle position (will be offset externally)
    this._gemGroup.position.set(0, 0, 0);
  }

  /**
   * Get the gem display group to add to the scene.
   */
  getGemGroup() {
    return this._gemGroup;
  }

  /**
   * Calculate the current castle level from completed task count.
   * @param {number} completedCount
   * @returns {number} level (0-4)
   */
  static levelForCount(completedCount) {
    let level = 0;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (completedCount >= LEVEL_THRESHOLDS[i]) {
        level = i;
        break;
      }
    }
    return level;
  }

  /**
   * Get the threshold for the next level.
   * @param {number} currentLevel
   * @returns {number|null} — gem count needed, or null if max level
   */
  static nextLevelThreshold(currentLevel) {
    if (currentLevel >= LEVEL_THRESHOLDS.length - 1) return null;
    return LEVEL_THRESHOLDS[currentLevel + 1];
  }

  /**
   * Update the castle based on the current count of completed tasks.
   * Adds/removes gems and upgrades castle appearance as needed.
   * @param {number} completedCount — total number of tasks at 100%
   */
  update(completedCount) {
    const newLevel = CastleEvolution.levelForCount(completedCount);

    // Add gems for newly completed tasks
    while (this._gemCount < completedCount) {
      this._addGem(this._gemCount);
      this._gemCount++;
    }

    // Level up — apply visual upgrade
    if (newLevel > this._level) {
      this._level = newLevel;
      this._applyLevelUpgrade(newLevel);
    }
  }

  /**
   * Get current state for display in UI.
   */
  getState() {
    return {
      level: this._level,
      gemCount: this._gemCount,
      nextLevelAt: CastleEvolution.nextLevelThreshold(this._level),
    };
  }

  // ─── Internal ──────────────────────────────────────────────────

  /**
   * Add a gem to the treasury display around the castle courtyard.
   */
  _addGem(index) {
    const colorIndex = index % GEM_COLORS.length;
    const gemColor = GEM_COLORS[colorIndex];

    const geo = new THREE.IcosahedronGeometry(GEM_RADIUS, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: gemColor,
      emissive: gemColor,
      emissiveIntensity: 0.3,
      roughness: 0.2,
      metalness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Arrange gems in a spiral around the castle courtyard
    const ring = Math.floor(index / 8);
    const slot = index % 8;
    const angle = (slot / 8) * Math.PI * 2 + ring * 0.4; // offset each ring
    const r = (this._radius * 0.3) + ring * 0.35;

    mesh.position.set(
      this._cx + Math.cos(angle) * r,
      0.2 + ring * 0.15,
      this._cz + Math.sin(angle) * r
    );
    mesh.castShadow = true;

    // Slight random rotation for visual variety
    mesh.rotation.set(
      Math.sin(index * 1.3) * 0.5,
      index * 0.8,
      Math.cos(index * 0.7) * 0.5
    );

    this._gemGroup.add(mesh);
    this._gemMeshes.push(mesh);
  }

  /**
   * Apply visual changes to the castle at a new level.
   * Modifies the base castle group's materials.
   */
  _applyLevelUpgrade(level) {
    const levelMat = LEVEL_MATERIALS[level];
    if (!levelMat) return;

    const upgradeColor = new THREE.Color(levelMat.color);

    // Traverse castle group and tint wall/tower meshes
    this._base.group.traverse(child => {
      if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
        // Blend the existing color toward the upgrade color
        // Higher levels = more golden/refined appearance
        const blendFactor = level * 0.15; // 0, 0.15, 0.3, 0.45, 0.6
        child.material.color.lerp(upgradeColor, blendFactor);
        child.material.roughness = Math.min(child.material.roughness, levelMat.roughness);
        child.material.metalness = Math.max(child.material.metalness, levelMat.metalness);
      }
    });

    // Level 2+: Add banners to towers (simple colored planes)
    if (level >= 2 && this._bannerMeshes.length === 0) {
      this._addBanners();
    }

    // Level 4: Add emissive glow to the keep
    if (level >= 4) {
      this._base.group.traverse(child => {
        if (child.isMesh && child.material) {
          // Apply a subtle gold emissive to everything
          child.material.emissive = new THREE.Color(0xD4A040);
          child.material.emissiveIntensity = 0.08;
        }
      });
    }
  }

  /**
   * Add decorative banners to tower positions.
   */
  _addBanners() {
    const bannerGeo = new THREE.PlaneGeometry(0.3, 0.5);
    const bannerMat = new THREE.MeshStandardMaterial({
      color: THEME.base.flag ? THEME.base.flag.color : 0x6040A0,
      side: THREE.DoubleSide,
      roughness: 0.8,
    });

    const wo = this._radius * 0.7;
    const bannerY = 2.8;
    const corners = [
      { x: this._cx + wo, z: this._cz + wo },
      { x: this._cx + wo, z: this._cz - wo },
      { x: this._cx - wo, z: this._cz + wo },
      { x: this._cx - wo, z: this._cz - wo },
    ];

    for (const c of corners) {
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.set(c.x + 0.25, bannerY, c.z);
      banner.castShadow = true;
      this._base.group.add(banner);
      this._bannerMeshes.push(banner);
    }
  }

  /**
   * Animate gems (gentle rotation + bob).
   * Call from the render loop.
   */
  animateGems(dt) {
    for (let i = 0; i < this._gemMeshes.length; i++) {
      const gem = this._gemMeshes[i];
      gem.rotation.y += dt * (0.5 + i * 0.05);
      gem.position.y += Math.sin(Date.now() * 0.002 + i) * dt * 0.02;
    }
  }
}
