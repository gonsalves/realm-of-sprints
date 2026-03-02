import * as THREE from 'three';
import { modelFactory } from '../models/ModelFactory.js';

/**
 * Avatar — thin wrapper around a model instance from ModelFactory.
 *
 * Maintains backward compatibility with the existing API surface
 * consumed by UnitManager, Raycaster, DetailPanel, etc., while
 * delegating all geometry and animation to the model provider.
 *
 * To swap in a custom 3D model, register a new 'avatar' provider
 * with ModelFactory before creating Avatar instances.
 */
export class Avatar {
  constructor(personData) {
    this.personId = personData.id;

    // Create model via factory
    this._model = modelFactory.create('avatar', {
      id: personData.id,
      name: personData.name,
      color: personData.color,
    });

    this.group = this._model.group;

    // Movement state (owned by Avatar, not the model)
    this.homePosition = new THREE.Vector3(0, 0, 0);
    this.wanderTarget = new THREE.Vector3(0, 0, 0);
    this.energy = 1.0;
    this._initialized = false;
  }

  // ─── Model delegation ──────────────────────────────────────────

  setHomePosition(x, z) {
    this.homePosition.set(x, 0, z);
    if (!this._initialized) {
      this.group.position.set(x, 0, z);
      this.wanderTarget.set(x, 0, z);
      this._initialized = true;
    }
  }

  setEnergy(value) {
    this.energy = value;
    this._model.setEnergy(value);
  }

  setCarrying(carrying) {
    this._model.setCarrying(carrying);
  }

  // ─── Animations (public API for UnitManager) ──────────────────

  playGatherAnimation(dt) {
    this._model.animate('gather', dt);
  }

  playBuildAnimation(dt) {
    this._model.animate('build', dt);
  }

  faceDirection(dx, dz, dt) {
    this._model.faceDirection(dx, dz, dt);
  }

  updateWalkAnimation(dt) {
    const dx = this.wanderTarget.x - this.group.position.x;
    const dz = this.wanderTarget.z - this.group.position.z;
    const isMoving = Math.sqrt(dx * dx + dz * dz) > 0.15;
    this._model.animate(isMoving ? 'walk' : 'idle', dt);
  }

  // ─── Visual state ─────────────────────────────────────────────

  update(dt, camera) {
    this.updateWalkAnimation(dt);
  }

  setTimeOfDay(t) {
    this._model.setTimeOfDay(t);
  }

  setShadowOpacity(opacity) {
    this._model.setShadowOpacity(opacity);
  }

  highlight() {
    this._model.setHighlight(true);
  }

  unhighlight() {
    this._model.setHighlight(false);
  }

  getPickables() {
    return this._model.getPickTargets();
  }

  dispose() {
    this._model.dispose();
  }
}
