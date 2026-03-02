import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal Three.js mock — just enough for TownPortal to construct meshes
vi.mock('three', () => {
  class MockMaterial {
    constructor(opts = {}) {
      Object.assign(this, { opacity: 1, transparent: false, ...opts });
    }
    dispose() {}
  }
  class MockGeometry {
    dispose() {}
  }
  class MockMesh {
    constructor() {
      this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.visible = true;
      this.geometry = new MockGeometry();
      this.material = new MockMaterial();
    }
  }
  class MockScene {
    constructor() { this.children = []; }
    add(child) { this.children.push(child); }
    remove(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
    }
  }
  return {
    TorusGeometry: class extends MockGeometry {},
    IcosahedronGeometry: class extends MockGeometry {},
    MeshStandardMaterial: MockMaterial,
    Mesh: MockMesh,
    DoubleSide: 2,
    Group: MockScene, // close enough for our needs
    Scene: MockScene,
  };
});

// Import after mock
const { TownPortal, _Phase: Phase } = await import('../src/map/TownPortal.js');

// Helper: create a mock scene
function makeScene() {
  const scene = { children: [], add(c) { this.children.push(c); }, remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); } };
  return scene;
}

describe('TownPortal', () => {
  let scene, portal;

  beforeEach(() => {
    scene = makeScene();
    portal = new TownPortal(scene, 10, 10); // castle at (10, 10)
  });

  describe('trigger', () => {
    it('adds a portal animation for a task', () => {
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});
      expect(portal.isActive('task-1')).toBe(true);
      expect(portal.activeCount).toBe(1);
    });

    it('does not double-trigger the same task', () => {
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});
      expect(portal.activeCount).toBe(1);
    });

    it('supports concurrent portals for different tasks', () => {
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});
      portal.trigger('task-2', 8, 3, 1, () => {}, () => {});
      expect(portal.activeCount).toBe(2);
      expect(portal.isActive('task-1')).toBe(true);
      expect(portal.isActive('task-2')).toBe(true);
    });

    it('adds portal and gem meshes to the scene', () => {
      const before = scene.children.length;
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});
      // Should add 2 meshes: portal ring + flight gem
      expect(scene.children.length).toBe(before + 2);
    });
  });

  describe('animation lifecycle', () => {
    it('calls onMarkerHide during opening phase', () => {
      const onHide = vi.fn();
      portal.trigger('task-1', 5, 5, 0, onHide, () => {});

      // Advance past MARKER_SHRINK_DELAY (0.2s)
      portal.update(0.3);
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('calls onMarkerHide only once', () => {
      const onHide = vi.fn();
      portal.trigger('task-1', 5, 5, 0, onHide, () => {});

      portal.update(0.3);
      portal.update(0.3);
      portal.update(0.3);
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('completes full sequence and calls onComplete', () => {
      const onComplete = vi.fn();
      portal.trigger('task-1', 5, 5, 0, () => {}, onComplete);

      // Run through entire animation (well beyond total duration ~2.5s)
      for (let i = 0; i < 50; i++) {
        portal.update(0.1);
      }
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('removes from active set after completion', () => {
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});

      // Run to completion
      for (let i = 0; i < 50; i++) {
        portal.update(0.1);
      }
      expect(portal.isActive('task-1')).toBe(false);
      expect(portal.activeCount).toBe(0);
    });

    it('cleans up meshes from scene after completion', () => {
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});
      const added = scene.children.length;
      expect(added).toBeGreaterThan(0);

      // Run to completion
      for (let i = 0; i < 50; i++) {
        portal.update(0.1);
      }
      expect(scene.children.length).toBe(0);
    });
  });

  describe('dispose', () => {
    it('cleans up all active portals', () => {
      portal.trigger('task-1', 5, 5, 0, () => {}, () => {});
      portal.trigger('task-2', 8, 3, 1, () => {}, () => {});
      expect(portal.activeCount).toBe(2);

      portal.dispose();
      expect(portal.activeCount).toBe(0);
      expect(scene.children.length).toBe(0);
    });
  });

  describe('timing phases', () => {
    it('transitions from opening to marker_shrink to gem_flight', () => {
      const onHide = vi.fn();
      const onComplete = vi.fn();
      portal.trigger('task-1', 5, 5, 0, onHide, onComplete);

      // Opening phase: 0.5s total
      portal.update(0.1);
      expect(portal.isActive('task-1')).toBe(true);
      expect(onHide).not.toHaveBeenCalled(); // hide at 0.2s

      // Past marker shrink delay
      portal.update(0.15);
      expect(onHide).toHaveBeenCalled();

      // Complete opening (0.5s total, we've done 0.25s so far)
      portal.update(0.3);

      // Now in marker_shrink phase (0.4s)
      portal.update(0.5);

      // Now in gem_flight phase (1.2s)
      // Not yet complete
      expect(onComplete).not.toHaveBeenCalled();

      // Complete the flight
      portal.update(1.5);
      expect(onComplete).toHaveBeenCalled();
    });

    it('can handle large dt values gracefully', () => {
      const onComplete = vi.fn();
      portal.trigger('task-1', 5, 5, 0, () => {}, onComplete);

      // Large dt values — each call advances at least one phase
      // Phase transitions reset timer, so we need multiple calls
      portal.update(10); // opening → marker_shrink (timer resets)
      portal.update(10); // marker_shrink → gem_flight (timer resets)
      portal.update(10); // gem_flight → done
      portal.update(0.01); // cleanup pass
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(portal.isActive('task-1')).toBe(false);
    });
  });
});
