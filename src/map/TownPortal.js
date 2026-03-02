/**
 * TownPortal — manages the "task complete" visual sequence.
 *
 * When a task reaches 100%:
 *   1. A glowing portal ring appears at the task marker position
 *   2. The resource node marker shrinks into the portal
 *   3. A gem whisks along an arc from the portal to the castle treasury
 *   4. The portal shrinks and disappears
 *   5. CastleEvolution.update() is called so the gem lands in the courtyard
 *
 * Multiple portals can run concurrently. Each portal is a self-contained
 * animation with its own phase/timer state.
 */

import * as THREE from 'three';

// ─── Timing (seconds) ────────────────────────────────────────────
const PORTAL_OPEN_DURATION = 0.5;   // ring scales from 0 → 1
const MARKER_SHRINK_DURATION = 0.4; // resource node shrinks into portal
const GEM_FLIGHT_DURATION = 1.2;    // gem arcs from portal to castle
const PORTAL_CLOSE_DURATION = 0.4;  // ring scales 1 → 0
const MARKER_SHRINK_DELAY = 0.2;    // slight delay before marker shrinks (portal opens first)

// ─── Visual constants ────────────────────────────────────────────
const PORTAL_RADIUS = 0.5;
const PORTAL_TUBE = 0.06;
const PORTAL_COLOR = 0x88CCFF;
const PORTAL_EMISSIVE = 0x4488FF;
const PORTAL_EMISSIVE_INTENSITY = 1.5;

const FLIGHT_ARC_HEIGHT = 4.0; // peak height of the gem's parabolic arc

const GEM_COLORS = [
  0xE8443A, // ruby
  0x44A8E8, // sapphire
  0x44E870, // emerald
  0xE8C844, // topaz
  0xC844E8, // amethyst
  0xE8A044, // amber
];

/**
 * Animation phases for a single portal sequence.
 * @enum {string}
 */
const Phase = {
  OPENING: 'opening',         // portal ring scaling up
  MARKER_SHRINK: 'shrinking', // resource node disappearing
  GEM_FLIGHT: 'flight',       // gem arcing toward castle
  CLOSING: 'closing',         // portal ring scaling down
  DONE: 'done',               // cleanup ready
};

export class TownPortal {
  /**
   * @param {THREE.Scene} scene — the main scene (portal meshes are added/removed here)
   * @param {number} castleX — castle world X
   * @param {number} castleZ — castle world Z
   */
  constructor(scene, castleX, castleZ) {
    this._scene = scene;
    this._castleX = castleX;
    this._castleZ = castleZ;

    /** @type {Map<string, PortalAnim>} taskId → animation state */
    this._active = new Map();
  }

  /**
   * Trigger a portal completion sequence for a task.
   * @param {string} taskId
   * @param {number} worldX — task marker world X
   * @param {number} worldZ — task marker world Z
   * @param {number} gemIndex — index for gem color cycling
   * @param {Function} onMarkerHide — called when marker should be hidden
   * @param {Function} onComplete — called when full sequence is done (gem arrived)
   */
  trigger(taskId, worldX, worldZ, gemIndex, onMarkerHide, onComplete) {
    // Don't double-trigger
    if (this._active.has(taskId)) return;

    // ─── Build portal ring ───────────────────────────────────
    const portalGeo = new THREE.TorusGeometry(PORTAL_RADIUS, PORTAL_TUBE, 16, 32);
    const portalMat = new THREE.MeshStandardMaterial({
      color: PORTAL_COLOR,
      emissive: PORTAL_EMISSIVE,
      emissiveIntensity: PORTAL_EMISSIVE_INTENSITY,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.position.set(worldX, 0.6, worldZ);
    portalMesh.rotation.x = -Math.PI / 2; // horizontal ring
    portalMesh.scale.set(0, 0, 0);
    this._scene.add(portalMesh);

    // ─── Build flight gem ────────────────────────────────────
    const gemColor = GEM_COLORS[gemIndex % GEM_COLORS.length];
    const gemGeo = new THREE.IcosahedronGeometry(0.1, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: gemColor,
      emissive: gemColor,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.5,
    });
    const gemMesh = new THREE.Mesh(gemGeo, gemMat);
    gemMesh.visible = false;
    gemMesh.position.set(worldX, 0.6, worldZ);
    this._scene.add(gemMesh);

    this._active.set(taskId, {
      phase: Phase.OPENING,
      timer: 0,
      portalMesh,
      gemMesh,
      startX: worldX,
      startZ: worldZ,
      onMarkerHide: onMarkerHide || (() => {}),
      onComplete: onComplete || (() => {}),
      markerHidden: false,
      completeCalled: false,
    });
  }

  /**
   * Returns true if a portal sequence is active for the given task.
   */
  isActive(taskId) {
    return this._active.has(taskId);
  }

  /**
   * Returns the number of currently active portal animations.
   */
  get activeCount() {
    return this._active.size;
  }

  /**
   * Advance all active portal animations. Call from the render loop.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    for (const [taskId, anim] of this._active) {
      anim.timer += dt;
      this._updateAnim(taskId, anim, dt);
    }

    // Clean up completed animations
    for (const [taskId, anim] of this._active) {
      if (anim.phase === Phase.DONE) {
        this._cleanup(anim);
        this._active.delete(taskId);
      }
    }
  }

  /**
   * Dispose all active portals (e.g. on scene teardown).
   */
  dispose() {
    for (const [, anim] of this._active) {
      this._cleanup(anim);
    }
    this._active.clear();
  }

  // ─── Internal ──────────────────────────────────────────────────

  _updateAnim(taskId, anim, dt) {
    switch (anim.phase) {

      case Phase.OPENING: {
        const t = Math.min(1, anim.timer / PORTAL_OPEN_DURATION);
        // Ease-out for snappy open
        const s = 1 - Math.pow(1 - t, 3);
        anim.portalMesh.scale.set(s, s, s);
        anim.portalMesh.rotation.z = t * Math.PI * 0.5; // gentle spin during open

        // Start marker shrink slightly before portal is fully open
        if (anim.timer >= MARKER_SHRINK_DELAY && !anim.markerHidden) {
          anim.markerHidden = true;
          anim.onMarkerHide();
        }

        if (t >= 1) {
          anim.phase = Phase.MARKER_SHRINK;
          anim.timer = 0;
        }
        break;
      }

      case Phase.MARKER_SHRINK: {
        const t = Math.min(1, anim.timer / MARKER_SHRINK_DURATION);
        // Portal pulses slightly during shrink
        const pulse = 1 + Math.sin(t * Math.PI) * 0.1;
        anim.portalMesh.scale.set(pulse, pulse, pulse);
        anim.portalMesh.rotation.z += dt * 2;

        if (t >= 1) {
          anim.phase = Phase.GEM_FLIGHT;
          anim.timer = 0;
          anim.gemMesh.visible = true;
        }
        break;
      }

      case Phase.GEM_FLIGHT: {
        const t = Math.min(1, anim.timer / GEM_FLIGHT_DURATION);
        // Ease-in-out
        const eased = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Lerp XZ position
        const x = anim.startX + (this._castleX - anim.startX) * eased;
        const z = anim.startZ + (this._castleZ - anim.startZ) * eased;

        // Parabolic arc for Y: peaks at midpoint
        const arcT = 4 * t * (1 - t); // 0 at start/end, 1 at midpoint
        const y = 0.6 + FLIGHT_ARC_HEIGHT * arcT;

        anim.gemMesh.position.set(x, y, z);
        anim.gemMesh.rotation.y += dt * 8; // fast spin during flight

        // Portal shrinks as gem departs
        const portalFade = Math.max(0, 1 - t * 2); // fully gone by t=0.5
        anim.portalMesh.scale.set(portalFade, portalFade, portalFade);
        anim.portalMesh.material.opacity = 0.9 * portalFade;
        anim.portalMesh.rotation.z += dt * 3;

        // Gem shrinks as it arrives (disappears into treasury)
        if (t > 0.85) {
          const arriveT = (t - 0.85) / 0.15;
          const gemScale = 1 - arriveT;
          anim.gemMesh.scale.set(gemScale, gemScale, gemScale);
        }

        if (t >= 1) {
          if (!anim.completeCalled) {
            anim.completeCalled = true;
            anim.onComplete();
          }
          anim.phase = Phase.DONE;
          anim.timer = 0;
        }
        break;
      }

      case Phase.CLOSING: {
        // Not used in current flow (portal fades during gem flight instead)
        anim.phase = Phase.DONE;
        break;
      }
    }
  }

  _cleanup(anim) {
    if (anim.portalMesh) {
      anim.portalMesh.geometry.dispose();
      anim.portalMesh.material.dispose();
      this._scene.remove(anim.portalMesh);
      anim.portalMesh = null;
    }
    if (anim.gemMesh) {
      anim.gemMesh.geometry.dispose();
      anim.gemMesh.material.dispose();
      this._scene.remove(anim.gemMesh);
      anim.gemMesh = null;
    }
  }
}

// Export Phase for testing
export { Phase as _Phase };
