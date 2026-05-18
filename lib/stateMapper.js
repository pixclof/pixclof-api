/**
 * State → zone mapping.
 * An agent reports a high-level `state`; the dashboard renders it in a `zone`.
 */

const STATE_ZONE_MAP = {
  working: 'workstations',
  idle: 'chill-corner',
  thinking: 'whiteboard',
  collaborating: 'meeting-room',
  break: 'pantry',
  playing: 'gaming',
  sleeping: 'nap-pod',
  error: 'workstations',
  online: 'lobby',
};

/** All states an agent is allowed to report. */
export const VALID_STATES = Object.keys(STATE_ZONE_MAP);

/**
 * Map an agent state to its dashboard zone.
 * @param {string} state
 * @returns {string} Zone name, or 'lobby' for unknown states.
 */
export function mapStateToZone(state) {
  return STATE_ZONE_MAP[state] || 'lobby';
}

/**
 * Check whether a reported state is recognized.
 * @param {string} state
 * @returns {boolean}
 */
export function isValidState(state) {
  return VALID_STATES.includes(state);
}
