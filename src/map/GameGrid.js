/**
 * Pure-data grid for the game world. No Three.js dependency.
 * Each tile is 1×1 world units. Origin at (0, 0).
 */

export const TileType = {
  GRASS: 'grass',
  DIRT: 'dirt',
  STONE: 'stone',
  WATER: 'water',
  FOREST: 'forest',
  VOID: 'void',
};

/**
 * Biome identifiers for the fan-shaped v2 map.
 * Each biome corresponds to a stage of work.
 */
export const Biome = {
  CASTLE: 'castle',         // Home base area
  MEADOW: 'meadow',         // Planning — open fields near castle
  HILLS: 'hills',           // Ideating — misty standing stones
  FOREST: 'forest',         // Exploration — dense pathless woods
  QUARRY: 'quarry',         // Building — forge and construction
  SCRIPTORIUM: 'scriptorium', // Documenting — library ruins
  MARKET: 'market',         // Sharing — crossroads, trading post
  SUMMIT: 'summit',         // Presenting — amphitheatre, high ground
};

export const FogState = {
  HIDDEN: 'hidden',
  REVEALED: 'revealed',
  VISIBLE: 'visible',
};

export class GameGrid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height);

    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i] = {
        type: TileType.GRASS,
        biome: null,
        elevation: 0,
        fogState: FogState.HIDDEN,
        resourceNodeId: null,
        structureId: null,
        blocked: false,
      };
    }
  }

  _index(col, row) {
    return row * this.width + col;
  }

  inBounds(col, row) {
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  getTile(col, row) {
    if (!this.inBounds(col, row)) return null;
    return this.tiles[this._index(col, row)];
  }

  setTile(col, row, data) {
    if (!this.inBounds(col, row)) return;
    Object.assign(this.tiles[this._index(col, row)], data);
  }

  // --- Coordinate conversion ---

  tileToWorld(col, row) {
    // Tile center: col + 0.5, row + 0.5 offset from grid origin
    return { x: col + 0.5, z: row + 0.5 };
  }

  worldToTile(x, z) {
    return { col: Math.floor(x), row: Math.floor(z) };
  }

  // --- Walkability ---

  isWalkable(col, row) {
    const tile = this.getTile(col, row);
    if (!tile) return false;
    if (tile.blocked) return false;
    return tile.type !== TileType.WATER && tile.type !== TileType.VOID && tile.type !== TileType.FOREST;
  }

  // --- Neighbors (4-directional) ---

  getNeighbors(col, row) {
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const result = [];
    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (this.inBounds(nc, nr)) {
        result.push({ col: nc, row: nr });
      }
    }
    return result;
  }

  // --- Radius queries ---

  getTilesInRadius(centerCol, centerRow, radius) {
    const result = [];
    const r2 = radius * radius;
    const minC = Math.max(0, Math.floor(centerCol - radius));
    const maxC = Math.min(this.width - 1, Math.ceil(centerCol + radius));
    const minR = Math.max(0, Math.floor(centerRow - radius));
    const maxR = Math.min(this.height - 1, Math.ceil(centerRow + radius));

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const dc = c - centerCol;
        const dr = r - centerRow;
        if (dc * dc + dr * dr <= r2) {
          result.push({ col: c, row: r, tile: this.tiles[this._index(c, r)] });
        }
      }
    }
    return result;
  }

  // --- Fog ---

  revealTilesInRadius(centerCol, centerRow, radius) {
    const tiles = this.getTilesInRadius(centerCol, centerRow, radius);
    const revealed = [];
    for (const { col, row, tile } of tiles) {
      if (tile.fogState === FogState.HIDDEN) {
        tile.fogState = FogState.REVEALED;
        revealed.push({ col, row });
      }
    }
    return revealed;
  }

  setVisible(col, row) {
    const tile = this.getTile(col, row);
    if (tile) tile.fogState = FogState.VISIBLE;
  }

  setRevealed(col, row) {
    const tile = this.getTile(col, row);
    if (tile && tile.fogState === FogState.VISIBLE) {
      tile.fogState = FogState.REVEALED;
    }
  }

  // --- A* Pathfinding ---

  findPath(fromCol, fromRow, toCol, toRow) {
    if (!this.isWalkable(toCol, toRow)) return null;

    const key = (c, r) => `${c},${r}`;
    const start = key(fromCol, fromRow);
    const goal = key(toCol, toRow);

    const openSet = new Set([start]);
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(start, 0);
    fScore.set(start, this._heuristic(fromCol, fromRow, toCol, toRow));

    while (openSet.size > 0) {
      // Find node in openSet with lowest fScore
      let current = null;
      let bestF = Infinity;
      for (const k of openSet) {
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          current = k;
        }
      }

      if (current === goal) {
        return this._reconstructPath(cameFrom, current);
      }

      openSet.delete(current);
      const [cc, cr] = current.split(',').map(Number);

      for (const { col: nc, row: nr } of this.getNeighbors(cc, cr)) {
        if (!this.isWalkable(nc, nr)) continue;

        const nKey = key(nc, nr);
        const tentativeG = (gScore.get(current) ?? Infinity) + 1;

        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
          cameFrom.set(nKey, current);
          gScore.set(nKey, tentativeG);
          fScore.set(nKey, tentativeG + this._heuristic(nc, nr, toCol, toRow));
          openSet.add(nKey);
        }
      }
    }

    return null; // no path found
  }

  _heuristic(c1, r1, c2, r2) {
    // Manhattan distance
    return Math.abs(c1 - c2) + Math.abs(r1 - r2);
  }

  _reconstructPath(cameFrom, current) {
    const path = [];
    while (current) {
      const [c, r] = current.split(',').map(Number);
      path.unshift({ col: c, row: r });
      current = cameFrom.get(current);
    }
    return path;
  }
}
