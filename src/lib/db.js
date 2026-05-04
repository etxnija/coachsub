import Dexie from 'dexie';

export const db = new Dexie('CoachSub');

db.version(1).stores({
  team: 'id, name',
  players: '++id, name, number, position, teamId'
});

/** @typedef {'F' | 'M' | 'D' | 'G' | null} Position */

/**
 * @typedef {Object} Player
 * @property {number} [id]
 * @property {string} name
 * @property {number} number
 * @property {Position} position
 * @property {number} teamId
 */

/**
 * @typedef {Object} Team
 * @property {number} id
 * @property {string} name
 */

const TEAM_ID = 1;

/** @returns {Promise<Team>} */
export async function getOrCreateTeam() {
  let team = await db.team.get(TEAM_ID);
  if (!team) {
    await db.team.put({ id: TEAM_ID, name: 'My Team' });
    team = await db.team.get(TEAM_ID);
  }
  return /** @type {Team} */ (team);
}

/** @returns {Promise<Player[]>} */
export async function getPlayers() {
  return db.players.orderBy('number').toArray();
}

/** @param {number} id @returns {Promise<Player | undefined>} */
export async function getPlayer(id) {
  return db.players.get(id);
}

/** @param {Omit<Player, 'id'>} player @returns {Promise<number>} */
export async function addPlayer(player) {
  return db.players.add(player);
}

/** @param {number} id @param {Partial<Player>} changes @returns {Promise<number>} */
export async function updatePlayer(id, changes) {
  return db.players.update(id, changes);
}

/** @param {number} id @returns {Promise<void>} */
export async function deletePlayer(id) {
  return db.players.delete(id);
}

/** @param {string} name @returns {Promise<void>} */
export async function updateTeamName(name) {
  await db.team.update(TEAM_ID, { name });
}

export const POSITIONS = [
  { value: 'G', label: 'GK' },
  { value: 'D', label: 'DEF' },
  { value: 'M', label: 'MID' },
  { value: 'F', label: 'FWD' }
];
