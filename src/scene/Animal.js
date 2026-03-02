import { modelFactory } from '../models/ModelFactory.js';

/**
 * Animal — thin wrapper around a model instance from ModelFactory.
 *
 * Maintains backward compatibility with AnimalManager while
 * delegating geometry and animation to the model provider.
 */
export class Animal {
  constructor(type) {
    this.type = type;

    this._model = modelFactory.create('animal', { type });

    this.group = this._model.group;
    this.walkPhase = 0; // exposed for AnimalManager idle timing
    this.facingAngle = 0;
  }

  update(dt, isMoving) {
    this._model.animate(isMoving ? 'walk' : 'idle', dt);
  }

  faceDirection(dx, dz, dt) {
    this._model.faceDirection(dx, dz, dt);
  }

  dispose() {
    this._model.dispose();
  }
}
