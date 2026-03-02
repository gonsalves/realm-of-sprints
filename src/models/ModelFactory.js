/**
 * ModelFactory — central registry for 3D model providers.
 *
 * Game code requests models from this factory, never constructs geometry directly.
 * Each entity type (avatar, animal, castle, etc.) has a registered builder.
 *
 * Convention-based glTF loading:
 *   If a .glb file exists at `assets/models/{type}.glb`, the factory loads it
 *   instead of using the procedural builder. This is handled automatically
 *   when a GLTFModelProvider is registered.
 *
 * Usage:
 *   import { modelFactory } from './models/ModelFactory.js';
 *   const avatarModel = modelFactory.create('avatar', { color, name, ... });
 *   scene.add(avatarModel.group);
 *   avatarModel.animate('walk', dt);
 */

const _registry = new Map();

export const modelFactory = {
  /**
   * Register a model provider for an entity type.
   * @param {string} type — e.g. 'avatar', 'animal', 'castle', 'resource-node', 'structure'
   * @param {function} providerFn — (options) => ModelInstance
   */
  register(type, providerFn) {
    _registry.set(type, providerFn);
  },

  /**
   * Create a model instance.
   * @param {string} type — registered entity type
   * @param {object} options — type-specific creation options
   * @returns {object} — model instance conforming to the type's interface contract
   */
  create(type, options = {}) {
    const provider = _registry.get(type);
    if (!provider) {
      throw new Error(`ModelFactory: no provider registered for type "${type}"`);
    }
    return provider(options);
  },

  /**
   * Check if a provider is registered for a type.
   * @param {string} type
   * @returns {boolean}
   */
  has(type) {
    return _registry.has(type);
  },

  /**
   * List all registered types.
   * @returns {string[]}
   */
  types() {
    return [..._registry.keys()];
  },
};
