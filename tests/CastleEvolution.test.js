import { describe, it, expect } from 'vitest';
import { CastleEvolution } from '../src/map/CastleEvolution.js';

describe('CastleEvolution', () => {
  describe('levelForCount', () => {
    it('returns level 0 for 0 completions', () => {
      expect(CastleEvolution.levelForCount(0)).toBe(0);
    });

    it('returns level 0 for 4 completions', () => {
      expect(CastleEvolution.levelForCount(4)).toBe(0);
    });

    it('returns level 1 at exactly 5 completions', () => {
      expect(CastleEvolution.levelForCount(5)).toBe(1);
    });

    it('returns level 2 at 10 completions', () => {
      expect(CastleEvolution.levelForCount(10)).toBe(2);
    });

    it('returns level 3 at 20 completions', () => {
      expect(CastleEvolution.levelForCount(20)).toBe(3);
    });

    it('returns level 4 at 35 completions', () => {
      expect(CastleEvolution.levelForCount(35)).toBe(4);
    });

    it('stays at level 4 for counts above 35', () => {
      expect(CastleEvolution.levelForCount(100)).toBe(4);
    });
  });

  describe('nextLevelThreshold', () => {
    it('returns 5 for level 0', () => {
      expect(CastleEvolution.nextLevelThreshold(0)).toBe(5);
    });

    it('returns 10 for level 1', () => {
      expect(CastleEvolution.nextLevelThreshold(1)).toBe(10);
    });

    it('returns null for max level', () => {
      expect(CastleEvolution.nextLevelThreshold(4)).toBeNull();
    });
  });
});
