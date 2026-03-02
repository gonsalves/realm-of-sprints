import { describe, it, expect } from 'vitest';
import { BiomeTerrainGenerator } from '../src/map/BiomeTerrainGenerator.js';
import { GameGrid, TileType, Biome } from '../src/map/GameGrid.js';

describe('BiomeTerrainGenerator', () => {
  describe('generate', () => {
    it('fills entire grid with valid tile types', () => {
      const grid = new GameGrid(40, 40);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const validTypes = new Set(Object.values(TileType));
      for (const tile of grid.tiles) {
        expect(validTypes.has(tile.type)).toBe(true);
      }
    });

    it('returns castle position in the left portion of the map', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      const info = gen.generate(grid);

      // Castle should be in the left ~15% of the map
      expect(info.castleCol).toBeLessThan(grid.width * 0.2);
      // Castle should be vertically centered
      expect(info.castleRow).toBe(Math.floor(grid.height / 2));
    });

    it('places dirt in the castle base area', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      const info = gen.generate(grid);

      const tile = grid.getTile(info.castleCol, info.castleRow);
      expect(tile.type).toBe(TileType.DIRT);
      expect(tile.biome).toBe(Biome.CASTLE);
    });

    it('assigns biomes to tiles within the fan', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const biomesFound = new Set();
      for (const tile of grid.tiles) {
        if (tile.biome) biomesFound.add(tile.biome);
      }

      // Should have multiple biomes
      expect(biomesFound.size).toBeGreaterThanOrEqual(4);
      expect(biomesFound.has(Biome.CASTLE)).toBe(true);
      expect(biomesFound.has(Biome.MEADOW)).toBe(true);
    });

    it('places void tiles outside the fan shape', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      // Top-left corner should be void (outside the fan)
      expect(grid.getTile(0, 0).type).toBe(TileType.VOID);
      // Bottom-left corner should also be void
      expect(grid.getTile(0, 79).type).toBe(TileType.VOID);
    });

    it('is deterministic with the same seed', () => {
      const grid1 = new GameGrid(40, 40);
      const grid2 = new GameGrid(40, 40);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid1, 42);
      gen.generate(grid2, 42);

      for (let i = 0; i < grid1.tiles.length; i++) {
        expect(grid1.tiles[i].type).toBe(grid2.tiles[i].type);
        expect(grid1.tiles[i].biome).toBe(grid2.tiles[i].biome);
      }
    });

    it('biomes are roughly concentric — inner tiles closer to castle, outer further', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      const info = gen.generate(grid);

      // Sample tiles at increasing distances from castle along the fan center (rightward)
      const castleCol = info.castleCol;
      const castleRow = info.castleRow;

      // Near castle should be castle or meadow biome
      const nearTile = grid.getTile(castleCol + 8, castleRow);
      expect([Biome.CASTLE, Biome.MEADOW]).toContain(nearTile.biome);

      // Far from castle (rightward) should be an outer biome
      const farTile = grid.getTile(castleCol + 50, castleRow);
      if (farTile && farTile.biome) {
        expect([Biome.CASTLE, Biome.MEADOW]).not.toContain(farTile.biome);
      }
    });
  });

  describe('placeResourceNodes', () => {
    it('returns one node per task', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const tasks = [
        { id: 't1', category: 'Design', discoveryPercent: 30, percentComplete: 0 },
        { id: 't2', category: 'Research', discoveryPercent: 70, percentComplete: 50 },
      ];

      const nodes = gen.placeResourceNodes(grid, tasks);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].taskId).toBe('t1');
      expect(nodes[1].taskId).toBe('t2');
    });

    it('places nodes on walkable terrain', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const tasks = [
        { id: 't1', category: 'Design', discoveryPercent: 50, percentComplete: 0, stage: 'planning' },
      ];

      const nodes = gen.placeResourceNodes(grid, tasks);
      for (const node of nodes) {
        const tile = grid.getTile(node.col, node.row);
        expect(tile.type).not.toBe(TileType.WATER);
        expect(tile.type).not.toBe(TileType.VOID);
        expect(tile.blocked).toBe(true);
      }
    });

    it('places tasks with a stage into the correct biome region', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const tasks = [
        { id: 't1', category: 'Design', discoveryPercent: 50, percentComplete: 0, stage: 'planning' },
      ];

      const nodes = gen.placeResourceNodes(grid, tasks);
      expect(nodes[0].biome).toBe(Biome.MEADOW);
    });

    it('marks completed tasks as depleted', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const tasks = [
        { id: 't1', category: 'Design', discoveryPercent: 50, percentComplete: 100 },
      ];

      const nodes = gen.placeResourceNodes(grid, tasks);
      expect(nodes[0].depleted).toBe(true);
    });

    it('includes task size in node data', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const tasks = [
        { id: 't1', category: 'Design', discoveryPercent: 50, percentComplete: 0, size: 'large' },
        { id: 't2', category: 'Design', discoveryPercent: 50, percentComplete: 0, size: 'small' },
        { id: 't3', category: 'Design', discoveryPercent: 50, percentComplete: 0 },
      ];

      const nodes = gen.placeResourceNodes(grid, tasks);
      expect(nodes[0].size).toBe('large');
      expect(nodes[1].size).toBe('small');
      expect(nodes[2].size).toBe('medium'); // default
    });

    it('maps different stages to different biomes', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const tasks = [
        { id: 't1', category: 'Design', discoveryPercent: 50, percentComplete: 0, stage: 'exploration' },
        { id: 't2', category: 'Design', discoveryPercent: 50, percentComplete: 0, stage: 'building' },
        { id: 't3', category: 'Design', discoveryPercent: 50, percentComplete: 0, stage: 'presenting' },
      ];

      const nodes = gen.placeResourceNodes(grid, tasks);
      expect(nodes[0].biome).toBe(Biome.FOREST);
      expect(nodes[1].biome).toBe(Biome.QUARRY);
      expect(nodes[2].biome).toBe(Biome.SUMMIT);
    });

    it('places exploration tasks further from castle than planning tasks', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      const info = gen.generate(grid);

      const tasks = [
        { id: 't-plan', category: 'Design', discoveryPercent: 50, percentComplete: 0, stage: 'planning' },
        { id: 't-explore', category: 'Design', discoveryPercent: 50, percentComplete: 0, stage: 'exploration' },
      ];

      const nodes = gen.placeResourceNodes(grid, tasks);
      const planDist = Math.sqrt(
        Math.pow(nodes[0].col - info.castleCol, 2) + Math.pow(nodes[0].row - info.castleRow, 2)
      );
      const exploreDist = Math.sqrt(
        Math.pow(nodes[1].col - info.castleCol, 2) + Math.pow(nodes[1].row - info.castleRow, 2)
      );
      // Exploration biome (forest) is further from castle than planning (meadow)
      expect(exploreDist).toBeGreaterThan(planDist);
    });
  });

  describe('placeStructures', () => {
    it('returns one position per milestone', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const milestones = [
        { id: 'ms-1', name: 'Sprint 1', taskIds: [] },
        { id: 'ms-2', name: 'Sprint 2', taskIds: [] },
      ];

      const positions = gen.placeStructures(grid, milestones);
      expect(positions).toHaveLength(2);
      expect(positions[0].milestoneId).toBe('ms-1');
      expect(positions[1].milestoneId).toBe('ms-2');
    });

    it('places structures on valid terrain and blocks tiles', () => {
      const grid = new GameGrid(80, 80);
      const gen = new BiomeTerrainGenerator();
      gen.generate(grid);

      const milestones = [{ id: 'ms-1', name: 'Test', taskIds: [] }];
      const positions = gen.placeStructures(grid, milestones);

      for (const pos of positions) {
        const tile = grid.getTile(pos.col, pos.row);
        expect(tile.type).not.toBe(TileType.WATER);
        expect(tile.type).not.toBe(TileType.VOID);
        expect(tile.blocked).toBe(true);
      }
    });
  });
});
