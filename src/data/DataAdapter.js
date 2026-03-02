/**
 * Abstract data adapter interface.
 * Concrete implementations pull people, tasks, milestones from external sources.
 *
 * @typedef {Object} ExternalPerson
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {string} color
 *
 * @typedef {Object} ExternalTask
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} assigneeId
 * @property {string} [category]       - becomes resource type
 * @property {string} [stage]          - work stage: planning, ideating, exploration, building, documenting, sharing, presenting
 * @property {string} [size]           - task size: small, medium, large
 * @property {number} discoveryPercent  - 0–100
 * @property {number} executionPercent  - 0–100
 * @property {number} percentComplete   - 0–100
 * @property {string} [expectedDate]    - ISO date string
 * @property {string|null} [milestoneId]
 *
 * @typedef {Object} ExternalMilestone
 * @property {string} id
 * @property {string} name
 * @property {string[]} taskIds
 */

export class DataAdapter {
  /** @returns {Promise<ExternalPerson[]>} */
  async fetchPeople() { throw new Error('Not implemented'); }

  /** @returns {Promise<ExternalTask[]>} */
  async fetchTasks() { throw new Error('Not implemented'); }

  /** @returns {Promise<ExternalMilestone[]>} */
  async fetchMilestones() { throw new Error('Not implemented'); }

  /** @returns {Promise<string[]>} Unique category labels = resource types */
  async fetchResourceTypes() { throw new Error('Not implemented'); }

  /** Pull fresh data from the source */
  async sync() { throw new Error('Not implemented'); }
}
