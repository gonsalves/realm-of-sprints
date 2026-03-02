/**
 * Register all default (procedural) model providers with the ModelFactory.
 * Call this once at app startup before creating any entities.
 *
 * To swap in a glTF model for any type, register a new provider after this
 * call — it will override the procedural one.
 */

import { modelFactory } from './ModelFactory.js';
import { buildProceduralAvatar } from './ProceduralAvatarBuilder.js';
import { buildProceduralAnimal } from './ProceduralAnimalBuilder.js';

export function registerDefaultModels() {
  modelFactory.register('avatar', buildProceduralAvatar);
  modelFactory.register('animal', buildProceduralAnimal);

  // Future registrations:
  // modelFactory.register('castle', buildProceduralCastle);
  // modelFactory.register('resource-node', buildProceduralResourceNode);
  // modelFactory.register('structure', buildProceduralStructure);
}
