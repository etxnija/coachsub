import Dexie from 'dexie';

export const db = new Dexie('CoachSub');

db.version(1).stores({
	team: 'id, name',
	players: '++id, name, number, position, teamId'
});

db.version(2).stores({
	team: 'id, name',
	players: '++id, name, number, position, teamId',
	matches: '++id, name, date, teamId',
	matchPlayers: '++id, matchId, playerId'
});

db.version(3).stores({
	team: 'id, name',
	players: '++id, name, number, position, teamId',
	matches: '++id, name, date, teamId',
	matchPlayers: '++id, matchId, playerId',
	matchStats: '++id, matchId',
	subEvents: '++id, matchId'
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

/**
 * @typedef {Object} Match
 * @property {number} [id]
 * @property {string} name
 * @property {string} [opponent]
 * @property {string} date
 * @property {string} format
 * @property {number} duration
 * @property {number} periods
 * @property {string} formation
 * @property {number} teamId
 */

/**
 * @typedef {'F'|'LM'|'CM'|'RM'|'LB'|'RB'|'GK'|null} MatchPosition
 */

/**
 * @typedef {Object} MatchPlayer
 * @property {number} [id]
 * @property {number} matchId
 * @property {number} playerId
 * @property {boolean} starting
 * @property {MatchPosition} matchPosition
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

/** @returns {Promise<Match[]>} */
export async function getMatches() {
	return db.matches.orderBy('date').reverse().toArray();
}

/** @param {number} id @returns {Promise<Match | undefined>} */
export async function getMatch(id) {
	return db.matches.get(id);
}

/** @param {Omit<Match, 'id'>} match @returns {Promise<number>} */
export async function createMatch(match) {
	return db.matches.add(match);
}

/** @param {number} matchId @returns {Promise<MatchPlayer[]>} */
export async function getMatchPlayers(matchId) {
	return db.matchPlayers.where('matchId').equals(matchId).toArray();
}

/**
 * Save all match players for a match (replaces existing).
 * @param {number} matchId
 * @param {Omit<MatchPlayer, 'id'>[]} players
 */
export async function saveMatchPlayers(matchId, players) {
	await db.matchPlayers.where('matchId').equals(matchId).delete();
	if (players.length > 0) {
		await db.matchPlayers.bulkAdd(players);
	}
}

/**
 * @typedef {Object} MatchStatSnapshot
 * @property {number} [id]
 * @property {number} matchId
 * @property {number} period
 * @property {Record<number, number>} totalMsPlayed
 * @property {Record<number, Record<string, number>>} msPerPosition
 */

/**
 * @typedef {Object} SubEvent
 * @property {number} [id]
 * @property {number} matchId
 * @property {number} period
 * @property {number} clockMs
 * @property {number} playerInId
 * @property {number} playerOutId
 * @property {string} position
 */

/**
 * @param {number} matchId
 * @param {number} period
 * @param {{ totalMsPlayed: Record<number, number>, msPerPosition: Record<number, Record<string, number>> }} data
 * @returns {Promise<number>}
 */
export async function saveMatchStats(matchId, period, data) {
	return db.matchStats.add({ matchId, period, ...data });
}

/**
 * @param {Omit<SubEvent, 'id'>} event
 * @returns {Promise<number>}
 */
export async function saveSubEvent(event) {
	return db.subEvents.add(event);
}

export const POSITIONS = [
	{ value: 'G', label: 'GK' },
	{ value: 'D', label: 'DEF' },
	{ value: 'M', label: 'MID' },
	{ value: 'F', label: 'FWD' }
];
