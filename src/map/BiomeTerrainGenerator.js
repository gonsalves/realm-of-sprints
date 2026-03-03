/**
 * BiomeTerrainGenerator — generates the v2 fan-shaped map with biome zones.
 *
 * Layout:
 *   - Castle at the left focal point of a ~180° fan
 *   - Biomes arranged in roughly concentric arcs radiating outward
 *   - Organic, irregular boundaries between biomes (noise-warped)
 *   - Smooth terrain blending at borders
 *   - Landmark positions generated at biome edges
 *
 * The map uses a polar coordinate system centered on the castle:
 *   - Distance from castle (r) determines which biome band
 *   - Angle (θ) spreads the fan, range: roughly -π/2 to +π/2 (pointing right)
 *
 * Biome order (inner → outer):
 *   castle → meadow → hills → forest → quarry → scriptorium → market → summit
 */

import { TileType, Biome } from './GameGrid.js';
import { CONFIG } from '../utils/Config.js';

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────

function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Value noise ─────────────────────────────────────────────────────

function valueNoise(x, z, scale) {
  const sx = Math.floor(x / scale);
  const sz = Math.floor(z / scale);
  const fx = (x / scale) - sx;
  const fz = (z / scale) - sz;

  const hash = (a, b) => {
    const h = ((a * 374761393 + b * 668265263 + 1234567) & 0x7fffffff);
    return (h % 1000) / 1000;
  };

  const v00 = hash(sx, sz);
  const v10 = hash(sx + 1, sz);
  const v01 = hash(sx, sz + 1);
  const v11 = hash(sx + 1, sz + 1);

  const smooth = t => t * t * (3 - 2 * t);
  const sfx = smooth(fx);
  const sfz = smooth(fz);

  return (v00 * (1 - sfx) + v10 * sfx) * (1 - sfz)
       + (v01 * (1 - sfx) + v11 * sfx) * sfz;
}

// ─── Biome band definitions ──────────────────────────────────────────

/**
 * Each biome occupies a radial band from the castle.
 * `rMin` and `rMax` are in normalized coordinates (0 = castle center, 1 = map edge).
 * Boundaries are warped by noise to create organic shapes.
 */
const BIOME_BANDS = [
  { biome: Biome.CASTLE,       rMin: 0.00, rMax: 0.10 },
  { biome: Biome.MEADOW,       rMin: 0.10, rMax: 0.25 },
  { biome: Biome.HILLS,        rMin: 0.25, rMax: 0.38 },
  { biome: Biome.FOREST,       rMin: 0.38, rMax: 0.52 },
  { biome: Biome.QUARRY,       rMin: 0.52, rMax: 0.64 },
  { biome: Biome.SCRIPTORIUM,  rMin: 0.64, rMax: 0.76 },
  { biome: Biome.MARKET,       rMin: 0.76, rMax: 0.88 },
  { biome: Biome.SUMMIT,       rMin: 0.88, rMax: 1.00 },
];

// Tile type palettes per biome (weighted random selection)
const BIOME_TILE_PALETTE = {
  [Biome.CASTLE]:       [{ type: TileType.DIRT, weight: 0.7 }, { type: TileType.STONE, weight: 0.3 }],
  [Biome.MEADOW]:       [{ type: TileType.GRASS, weight: 0.85 }, { type: TileType.DIRT, weight: 0.15 }],
  [Biome.HILLS]:        [{ type: TileType.GRASS, weight: 0.4 }, { type: TileType.STONE, weight: 0.4 }, { type: TileType.DIRT, weight: 0.2 }],
  [Biome.FOREST]:       [{ type: TileType.FOREST, weight: 0.55 }, { type: TileType.GRASS, weight: 0.35 }, { type: TileType.DIRT, weight: 0.1 }],
  [Biome.QUARRY]:       [{ type: TileType.STONE, weight: 0.55 }, { type: TileType.DIRT, weight: 0.35 }, { type: TileType.GRASS, weight: 0.1 }],
  [Biome.SCRIPTORIUM]:  [{ type: TileType.STONE, weight: 0.5 }, { type: TileType.DIRT, weight: 0.3 }, { type: TileType.GRASS, weight: 0.2 }],
  [Biome.MARKET]:       [{ type: TileType.DIRT, weight: 0.5 }, { type: TileType.GRASS, weight: 0.3 }, { type: TileType.STONE, weight: 0.2 }],
  [Biome.SUMMIT]:       [{ type: TileType.STONE, weight: 0.6 }, { type: TileType.GRASS, weight: 0.25 }, { type: TileType.DIRT, weight: 0.15 }],
};

export { BIOME_BANDS, Biome };

export class BiomeTerrainGenerator {

  /**
   * Generate the fan-shaped biome map.
   * @param {GameGrid} grid
   * @param {number} seed
   */
  generate(grid, seed = 42) {
    const rand = seededRandom(seed);

    // Castle position: bottom-center of the grid
    // Leave a margin so the castle isn't flush against the edge
    const castleCol = Math.floor(grid.width / 2);
    const castleRow = Math.floor(grid.height * 0.88);
    const maxRadius = grid.height * 0.82; // how far the fan extends upward

    // Fan angular range: -75° to +75° (pointing upward, 150° spread)
    const fanHalfAngle = Math.PI * (75 / 180);

    // Store castle position for external access
    this._castleCol = castleCol;
    this._castleRow = castleRow;
    this._maxRadius = maxRadius;
    this._fanHalfAngle = fanHalfAngle;

    // Biome border warp strength
    const warpStrength = 0.08;

    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const dx = col - castleCol;
        const dz = row - castleRow;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, -dz); // -π to π, 0 = up

        // Normalized distance (0 at castle, 1 at maxRadius)
        const rNorm = dist / maxRadius;

        // Hard cutoff well beyond the fan (saves work)
        if (rNorm > 1.35 || Math.abs(angle) > fanHalfAngle + 0.4) {
          grid.setTile(col, row, { type: TileType.VOID, biome: null });
          continue;
        }

        // Multi-octave coastline noise for organic edges
        // Use angle-based seed offset so the radial and angular edges differ
        const coastNoise1 = valueNoise(col * 0.4, row * 0.4, 7);       // large bays/peninsulas
        const coastNoise2 = valueNoise(col * 0.9 + 100, row * 0.9 + 100, 5); // medium coves
        const coastNoise3 = valueNoise(col * 2.0 + 300, row * 2.0 + 300, 3); // fine crags
        const coastWarp = (coastNoise1 * 0.55 + coastNoise2 * 0.3 + coastNoise3 * 0.15 - 0.5) * 0.25;

        // Different noise sample for the angular edge (so top/bottom differ from the arc)
        // Use distance-scaled amplitude: edges get more ragged further from castle
        const angCoastNoise1 = valueNoise(col * 0.25 + 500, row * 0.25 + 500, 9);  // large inlets
        const angCoastNoise2 = valueNoise(col * 0.6 + 600, row * 0.6 + 600, 5);    // medium jags
        const angCoastNoise3 = valueNoise(col * 1.5 + 700, row * 1.5 + 700, 3);    // fine teeth
        const angBase = angCoastNoise1 * 0.5 + angCoastNoise2 * 0.3 + angCoastNoise3 * 0.2 - 0.5;
        const angAmplitude = 0.25 + rNorm * 0.15; // stronger warp further from castle
        const angCoastWarp = angBase * angAmplitude;

        const fanEdgeDist = Math.abs(angle) / fanHalfAngle + angCoastWarp;
        const radialEdgeDist = rNorm + coastWarp;

        if (fanEdgeDist > 1.06 || radialEdgeDist > 1.06) {
          grid.setTile(col, row, { type: TileType.VOID, biome: null });
          continue;
        }
        if (fanEdgeDist > 0.96 || radialEdgeDist > 0.96) {
          grid.setTile(col, row, { type: TileType.WATER, biome: null });
          continue;
        }

        // Determine biome from radial distance (with noise warp for organic borders)
        const borderNoise1 = valueNoise(col * 0.5, row * 0.5, 6);
        const borderNoise2 = valueNoise(col * 0.3 + 200, row * 0.3 + 200, 4);
        const warp = (borderNoise1 * 0.6 + borderNoise2 * 0.4 - 0.5) * warpStrength * 2;
        const warpedR = rNorm + warp;

        const biome = this._getBiomeForRadius(warpedR);

        // Pick tile type from biome palette using noise
        const tileNoise = valueNoise(col + 500, row + 500, 3);
        const type = this._pickTileType(biome, tileNoise, rand);

        // Special handling: forest biome should have more forest tiles,
        // but we need walkable paths through it
        let finalType = type;
        if (biome === Biome.FOREST && type === TileType.FOREST) {
          // Create organic clearings using noise
          const clearingNoise = valueNoise(col * 0.7, row * 0.7, 4);
          if (clearingNoise > 0.65) {
            finalType = TileType.GRASS; // clearing in the forest
          }
        }

        // Water features: small ponds scattered throughout (except castle area)
        if (biome !== Biome.CASTLE && biome !== Biome.MEADOW) {
          const pondNoise = valueNoise(col * 1.2 + 300, row * 1.2 + 300, 3);
          if (pondNoise < 0.08 && rNorm > 0.2) {
            finalType = TileType.WATER;
          }
        }

        grid.setTile(col, row, { type: finalType, biome, elevation: 0 });
      }
    }

    // Grid-edge water/void border: ensure no land touches the grid boundary
    // Creates a natural island shoreline around the entire map
    const edgeBorderWidth = 3; // tiles of water/void at grid edges
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const tile = grid.getTile(col, row);
        if (!tile || tile.type === TileType.VOID) continue;

        // Distance to nearest grid edge
        const edgeDist = Math.min(col, row, grid.width - 1 - col, grid.height - 1 - row);
        if (edgeDist >= edgeBorderWidth) continue;

        // Noise-warped border so it's not a straight line
        const edgeNoise = valueNoise(col * 0.6 + 900, row * 0.6 + 900, 5);
        const warpedDist = edgeDist + (edgeNoise - 0.5) * 1.5;

        if (warpedDist < 1.0) {
          grid.setTile(col, row, { type: TileType.VOID, biome: null });
        } else if (warpedDist < 2.2) {
          grid.setTile(col, row, { type: TileType.WATER, biome: null });
        }
      }
    }

    // Ensure castle area is fully cleared
    const baseRadius = CONFIG.BASE_RADIUS;
    for (let row = castleRow - baseRadius; row <= castleRow + baseRadius; row++) {
      for (let col = castleCol - baseRadius; col <= castleCol + baseRadius; col++) {
        const dx = col - castleCol;
        const dz = row - castleRow;
        if (dx * dx + dz * dz <= baseRadius * baseRadius) {
          grid.setTile(col, row, { type: TileType.DIRT, biome: Biome.CASTLE, elevation: 0 });
        }
      }
    }

    return {
      castleCol,
      castleRow,
      maxRadius,
      fanHalfAngle,
    };
  }

  /**
   * Get the biome for a given normalized radial distance.
   */
  _getBiomeForRadius(rNorm) {
    for (const band of BIOME_BANDS) {
      if (rNorm >= band.rMin && rNorm < band.rMax) {
        return band.biome;
      }
    }
    // Beyond last band — default to summit (outermost)
    return Biome.SUMMIT;
  }

  /**
   * Pick a tile type from a biome's palette using noise as the selector.
   */
  _pickTileType(biome, noise, rand) {
    const palette = BIOME_TILE_PALETTE[biome];
    if (!palette) return TileType.GRASS;

    let cumulative = 0;
    for (const entry of palette) {
      cumulative += entry.weight;
      if (noise < cumulative) return entry.type;
    }
    return palette[palette.length - 1].type;
  }

  /**
   * Place resource nodes for tasks, positioned within the biome
   * matching the task's current stage.
   *
   * @param {GameGrid} grid
   * @param {Array} tasks — array of task objects with { id, stage, ... }
   * @param {string} [defaultBiome] — biome to use when task has no stage mapping
   * @returns {Array<{col, row, taskId, biome, resourceType, depleted}>}
   */
  placeResourceNodes(grid, tasks, defaultBiome = Biome.MEADOW) {
    const nodes = [];

    for (const task of tasks) {
      // Hash task ID for deterministic placement
      let hash = 0;
      for (let i = 0; i < task.id.length; i++) {
        hash = ((hash << 5) - hash + task.id.charCodeAt(i)) | 0;
      }
      const rand = seededRandom(Math.abs(hash));

      // Determine target biome from task stage
      const biome = this._stageToBaseBiome(task.stage) || defaultBiome;

      // Find the radial band for this biome
      const band = BIOME_BANDS.find(b => b.biome === biome) || BIOME_BANDS[1];
      const rMin = band.rMin;
      const rMax = band.rMax;

      // Pick a random position within the biome's radial band and fan angle
      const r = (rMin + rand() * (rMax - rMin)) * this._maxRadius;
      const angle = (rand() - 0.5) * 2 * this._fanHalfAngle * 0.85; // stay inside fan

      // Fan points upward: angle 0 = up (-row), positive = clockwise
      let col = Math.round(this._castleCol + Math.sin(angle) * r);
      let row = Math.round(this._castleRow - Math.cos(angle) * r);

      // Clamp and ensure walkable
      col = Math.max(1, Math.min(grid.width - 2, col));
      row = Math.max(1, Math.min(grid.height - 2, row));

      if (!grid.isWalkable(col, row)) {
        const found = this._findNearestWalkable(grid, col, row);
        if (found) { col = found.col; row = found.row; }
      }

      grid.setTile(col, row, { resourceNodeId: task.id, type: TileType.GRASS, blocked: true });

      nodes.push({
        col,
        row,
        biome,
        resourceType: task.category || 'Unknown',
        taskId: task.id,
        size: task.size || 'medium',
        depleted: task.percentComplete >= 100,
      });
    }

    return nodes;
  }

  /**
   * Place structures (milestones) in the outer biomes of the map.
   */
  placeStructures(grid, milestones) {
    const positions = [];

    for (const milestone of milestones) {
      let hash = 0;
      for (let i = 0; i < milestone.id.length; i++) {
        hash = ((hash << 5) - hash + milestone.id.charCodeAt(i)) | 0;
      }
      const rand = seededRandom(Math.abs(hash) + 9999);

      // Place structures in the middle-to-outer biomes
      const rMin = 0.4;
      const rMax = 0.85;
      const r = (rMin + rand() * (rMax - rMin)) * this._maxRadius;
      const angle = (rand() - 0.5) * 2 * this._fanHalfAngle * 0.8;

      // Fan points upward: angle 0 = up (-row), positive = clockwise
      let col = Math.round(this._castleCol + Math.sin(angle) * r);
      let row = Math.round(this._castleRow - Math.cos(angle) * r);

      col = Math.max(2, Math.min(grid.width - 3, col));
      row = Math.max(2, Math.min(grid.height - 3, row));

      if (!grid.isWalkable(col, row)) {
        const found = this._findNearestWalkable(grid, col, row);
        if (found) { col = found.col; row = found.row; }
      }

      grid.setTile(col, row, { structureId: milestone.id, type: TileType.DIRT, blocked: true });
      const crossDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dc, dr] of crossDirs) {
        const nc = col + dc;
        const nr = row + dr;
        if (grid.inBounds(nc, nr) && grid.isWalkable(nc, nr)) {
          grid.setTile(nc, nr, { blocked: true });
        }
      }
      positions.push({ col, row, milestoneId: milestone.id });
    }

    return positions;
  }

  /**
   * Map a task stage string to a biome.
   * Supports flexible stage naming.
   */
  _stageToBaseBiome(stage) {
    if (!stage) return null;
    const s = stage.toLowerCase().trim();

    if (s.includes('plan'))        return Biome.MEADOW;
    if (s.includes('ideat'))       return Biome.HILLS;
    if (s.includes('explor'))      return Biome.FOREST;
    if (s.includes('research'))    return Biome.FOREST;
    if (s.includes('build'))       return Biome.QUARRY;
    if (s.includes('execut'))      return Biome.QUARRY;
    if (s.includes('design'))      return Biome.QUARRY;
    if (s.includes('document'))    return Biome.SCRIPTORIUM;
    if (s.includes('shar'))        return Biome.MARKET;
    if (s.includes('review'))      return Biome.MARKET;
    if (s.includes('present'))     return Biome.SUMMIT;
    if (s.includes('deliver'))     return Biome.SUMMIT;

    return null;
  }

  _findNearestWalkable(grid, col, row) {
    for (let r = 1; r < 8; r++) {
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
          const nc = col + dc;
          const nr = row + dr;
          if (grid.isWalkable(nc, nr)) return { col: nc, row: nr };
        }
      }
    }
    return null;
  }

  /**
   * Get the biome at a specific grid position.
   */
  getBiomeAt(grid, col, row) {
    const tile = grid.getTile(col, row);
    return tile ? tile.biome : null;
  }

  /**
   * Get the castle position.
   */
  getCastlePosition() {
    return { col: this._castleCol, row: this._castleRow };
  }

  /**
   * Get all tiles belonging to a specific biome.
   */
  getTilesForBiome(grid, biome) {
    const tiles = [];
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const tile = grid.getTile(col, row);
        if (tile && tile.biome === biome) {
          tiles.push({ col, row, tile });
        }
      }
    }
    return tiles;
  }
}
