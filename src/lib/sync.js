/**
 * Sync layer: push local Dexie data to PocketBase and pull PB data into Dexie.
 *
 * ID strategy: Dexie uses auto-increment integers. PocketBase uses 15-char strings.
 * Each local record stores a `pbId` field after first sync. Stats keys (player IDs)
 * are remapped between local ints and PB strings on push/pull.
 */

import { getPb, syncState } from './pb.js';
import { db } from './db.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function client() {
	const pb = getPb();
	if (!pb?.authStore.isValid) throw new Error('Not connected');
	return pb;
}

function isConnected() {
	const pb = getPb();
	return pb?.authStore.isValid ?? false;
}

function setSyncing(v) {
	syncState.update((s) => ({ ...s, syncing: v }));
}

async function getTeamPbId() {
	const team = await db.team.get(1);
	return team?.pbId ?? null;
}

// ─── full sync ────────────────────────────────────────────────────────────────

/**
 * Bidirectional sync: push local-only records, pull PB-only records, update both.
 */
export async function syncAll() {
	if (!isConnected()) return;
	setSyncing(true);
	syncState.update((s) => ({ ...s, error: null }));
	try {
		await syncTeam();
		await syncPlayers();
		await syncMatches();
		await syncMatchPlayers();
		await syncMatchStats();
		syncState.update((s) => ({ ...s, syncing: false, lastSync: new Date() }));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		syncState.update((s) => ({ ...s, syncing: false, error: msg }));
		throw e;
	}
}

// ─── team ─────────────────────────────────────────────────────────────────────

async function syncTeam() {
	const local = await db.team.get(1);
	if (!local) return;

	if (local.pbId) {
		// Update PB with local name
		await client().collection('teams').update(local.pbId, { name: local.name });
	} else {
		// Check if a team already exists in PB (joining an existing team)
		const pbTeams = await client().collection('teams').getFullList();
		if (pbTeams.length > 0) {
			// Pull the existing team
			await db.team.put({ id: 1, name: pbTeams[0].name, pbId: pbTeams[0].id });
		} else {
			// Push local team to PB
			const record = await client().collection('teams').create({ name: local.name });
			await db.team.put({ id: 1, name: local.name, pbId: record.id });
		}
	}
}

export async function pushTeam() {
	if (!isConnected()) return;
	await syncTeam();
}

// ─── players ─────────────────────────────────────────────────────────────────

async function syncPlayers() {
	const teamPbId = await getTeamPbId();
	if (!teamPbId) return;

	const [localPlayers, pbPlayers] = await Promise.all([
		db.players.toArray(),
		client().collection('players').getFullList({ filter: `team="${teamPbId}"` })
	]);

	const pbById = Object.fromEntries(pbPlayers.map((p) => [p.id, p]));
	const localByPbId = Object.fromEntries(
		localPlayers.filter((p) => p.pbId).map((p) => [p.pbId, p])
	);

	// Push local players that aren't in PB yet
	for (const local of localPlayers) {
		if (!local.pbId) {
			const record = await client().collection('players').create({
				name: local.name,
				number: local.number,
				position: local.position ?? '',
				team: teamPbId
			});
			await db.players.update(/** @type {number} */ (local.id), { pbId: record.id });
		} else {
			// Update PB with latest local values
			await client().collection('players').update(local.pbId, {
				name: local.name,
				number: local.number,
				position: local.position ?? '',
				team: teamPbId
			});
		}
	}

	// Pull PB players that don't exist locally
	for (const pbPlayer of pbPlayers) {
		if (!localByPbId[pbPlayer.id]) {
			await db.players.add({
				name: pbPlayer.name,
				number: pbPlayer.number,
				position: pbPlayer.position || null,
				teamId: 1,
				pbId: pbPlayer.id
			});
		}
	}
}

export async function pushPlayer(localId) {
	if (!isConnected()) return;
	const player = await db.players.get(localId);
	if (!player) return;
	const teamPbId = await getTeamPbId();
	if (!teamPbId) return;

	const data = { name: player.name, number: player.number, position: player.position ?? '', team: teamPbId };
	if (player.pbId) {
		await client().collection('players').update(player.pbId, data).catch(console.error);
	} else {
		const record = await client().collection('players').create(data).catch(console.error);
		if (record) await db.players.update(localId, { pbId: record.id });
	}
}

export async function deletePlayerPb(pbId) {
	if (!isConnected() || !pbId) return;
	await client().collection('players').delete(pbId).catch(console.error);
}

// ─── matches ─────────────────────────────────────────────────────────────────

async function syncMatches() {
	const teamPbId = await getTeamPbId();
	if (!teamPbId) return;

	const [localMatches, pbMatches] = await Promise.all([
		db.matches.toArray(),
		client().collection('matches').getFullList({ filter: `team="${teamPbId}"` })
	]);

	const localByPbId = Object.fromEntries(
		localMatches.filter((m) => m.pbId).map((m) => [m.pbId, m])
	);

	// Push local matches not in PB, update existing
	for (const local of localMatches) {
		const data = {
			name: local.name,
			opponent: local.opponent ?? '',
			date: local.date,
			format: local.format,
			duration: local.duration,
			periods: local.periods,
			formation: local.formation,
			team: teamPbId,
			groupASlots: local.groupASlots ?? [],
			useGroups: local.useGroups ?? true,
			status: local.status ?? 'setup'
		};
		if (!local.pbId) {
			const record = await client().collection('matches').create(data);
			await db.matches.update(/** @type {number} */ (local.id), { pbId: record.id });
		} else {
			await client().collection('matches').update(local.pbId, data);
		}
	}

	// Pull PB matches not in local
	for (const pbMatch of pbMatches) {
		if (!localByPbId[pbMatch.id]) {
			await db.matches.add({
				name: pbMatch.name,
				opponent: pbMatch.opponent || undefined,
				date: pbMatch.date,
				format: pbMatch.format,
				duration: pbMatch.duration,
				periods: pbMatch.periods,
				formation: pbMatch.formation,
				teamId: 1,
				groupASlots: pbMatch.groupASlots ?? [],
				useGroups: pbMatch.useGroups ?? true,
				status: pbMatch.status ?? 'setup',
				pbId: pbMatch.id
			});
		}
	}
}

export async function pushMatch(localId) {
	if (!isConnected()) return;
	const match = await db.matches.get(localId);
	if (!match) return;
	const teamPbId = await getTeamPbId();
	if (!teamPbId) return;

	const data = {
		name: match.name,
		opponent: match.opponent ?? '',
		date: match.date,
		format: match.format,
		duration: match.duration,
		periods: match.periods,
		formation: match.formation,
		team: teamPbId,
		groupASlots: match.groupASlots ?? [],
		useGroups: match.useGroups ?? true,
		status: match.status ?? 'setup'
	};

	if (match.pbId) {
		await client().collection('matches').update(match.pbId, data).catch(console.error);
	} else {
		const record = await client().collection('matches').create(data).catch(console.error);
		if (record) await db.matches.update(localId, { pbId: record.id });
	}
}

// ─── match players ────────────────────────────────────────────────────────────

async function syncMatchPlayers() {
	const localMatches = await db.matches.toArray();

	for (const localMatch of localMatches) {
		if (!localMatch.pbId || !localMatch.id) continue;

		const [localMPs, pbMPs] = await Promise.all([
			db.matchPlayers.where('matchId').equals(/** @type {number} */ (localMatch.id)).toArray(),
			client()
				.collection('match_players')
				.getFullList({ filter: `match="${localMatch.pbId}"` })
		]);

		if (localMPs.length === 0 && pbMPs.length === 0) continue;

		// If local has data: push it (delete+recreate in PB — simplest conflict strategy)
		if (localMPs.length > 0) {
			for (const pbMp of pbMPs) {
				await client().collection('match_players').delete(pbMp.id);
			}
			for (const mp of localMPs) {
				const player = await db.players.get(mp.playerId);
				if (!player?.pbId) continue;
				await client().collection('match_players').create({
					match: localMatch.pbId,
					player: player.pbId,
					starting: mp.starting,
					matchPosition: mp.matchPosition ?? '',
					rotationGroup: mp.rotationGroup ?? ''
				});
			}
		} else {
			// Local is empty, pull from PB
			for (const pbMp of pbMPs) {
				const localPlayer = await db.players.where('pbId').equals(pbMp.player).first();
				if (!localPlayer?.id) continue;
				const exists = await db.matchPlayers
					.where('matchId').equals(/** @type {number} */ (localMatch.id))
					.and((mp) => mp.playerId === localPlayer.id)
					.first();
				if (!exists) {
					await db.matchPlayers.add({
						matchId: /** @type {number} */ (localMatch.id),
						playerId: /** @type {number} */ (localPlayer.id),
						starting: pbMp.starting,
						matchPosition: pbMp.matchPosition || null,
						rotationGroup: pbMp.rotationGroup || null
					});
				}
			}
		}
	}
}

export async function pushMatchPlayers(matchLocalId) {
	if (!isConnected()) return;
	const match = await db.matches.get(matchLocalId);
	if (!match?.pbId) return;

	const localMPs = await db.matchPlayers.where('matchId').equals(matchLocalId).toArray();
	const pbMPs = await client()
		.collection('match_players')
		.getFullList({ filter: `match="${match.pbId}"` })
		.catch(() => /** @type {any[]} */ ([]));

	for (const pbMp of pbMPs) {
		await client().collection('match_players').delete(pbMp.id).catch(console.error);
	}
	for (const mp of localMPs) {
		const player = await db.players.get(mp.playerId);
		if (!player?.pbId) continue;
		await client().collection('match_players').create({
			match: match.pbId,
			player: player.pbId,
			starting: mp.starting,
			matchPosition: mp.matchPosition ?? '',
			rotationGroup: mp.rotationGroup ?? ''
		}).catch(console.error);
	}
}

// ─── match stats ─────────────────────────────────────────────────────────────

/**
 * Stats use player IDs as keys. Local = numeric, PB = pbId strings.
 * Must remap on push and pull.
 */

/** @param {Record<string,number>} totalMs @param {Record<string,Record<string,number>>} msPerPos */
async function statsLocalToPb(totalMs, msPerPos) {
	const players = await db.players.toArray();
	/** @type {Record<number,string>} */
	const localToPb = {};
	for (const p of players) {
		if (p.id !== undefined && p.pbId) localToPb[p.id] = p.pbId;
	}
	/** @type {Record<string,number>} */
	const pbTotal = {};
	/** @type {Record<string,Record<string,number>>} */
	const pbPerPos = {};
	for (const [id, ms] of Object.entries(totalMs)) {
		const pbId = localToPb[Number(id)];
		if (pbId) pbTotal[pbId] = ms;
	}
	for (const [id, pos] of Object.entries(msPerPos)) {
		const pbId = localToPb[Number(id)];
		if (pbId) pbPerPos[pbId] = pos;
	}
	return { totalMsPlayed: pbTotal, msPerPosition: pbPerPos };
}

/** @param {Record<string,number>} pbTotal @param {Record<string,Record<string,number>>} pbPerPos */
async function statsPbToLocal(pbTotal, pbPerPos) {
	const players = await db.players.toArray();
	/** @type {Record<string,number>} */
	const pbToLocal = {};
	for (const p of players) {
		if (p.pbId && p.id !== undefined) pbToLocal[p.pbId] = p.id;
	}
	/** @type {Record<number,number>} */
	const localTotal = {};
	/** @type {Record<number,Record<string,number>>} */
	const localPerPos = {};
	for (const [pbId, ms] of Object.entries(pbTotal)) {
		const localId = pbToLocal[pbId];
		if (localId !== undefined) localTotal[localId] = ms;
	}
	for (const [pbId, pos] of Object.entries(pbPerPos)) {
		const localId = pbToLocal[pbId];
		if (localId !== undefined) localPerPos[localId] = pos;
	}
	return { totalMsPlayed: localTotal, msPerPosition: localPerPos };
}

async function syncMatchStats() {
	const localMatches = await db.matches.toArray();

	for (const localMatch of localMatches) {
		if (!localMatch.pbId || !localMatch.id) continue;

		const [localStats, pbStats] = await Promise.all([
			db.matchStats.where('matchId').equals(/** @type {number} */ (localMatch.id)).toArray(),
			client()
				.collection('match_stats')
				.getFullList({ filter: `match="${localMatch.pbId}"` })
		]);

		const pbByPeriod = Object.fromEntries(pbStats.map((s) => [s.period, s]));
		const localByPeriod = Object.fromEntries(localStats.map((s) => [s.period, s]));

		// Push local stats to PB
		for (const local of localStats) {
			const mapped = await statsLocalToPb(local.totalMsPlayed, local.msPerPosition);
			const data = { match: localMatch.pbId, period: local.period, ...mapped };
			if (pbByPeriod[local.period]) {
				await client()
					.collection('match_stats')
					.update(pbByPeriod[local.period].id, data)
					.catch(console.error);
			} else {
				await client().collection('match_stats').create(data).catch(console.error);
			}
		}

		// Pull PB stats not in local
		for (const pbStat of pbStats) {
			if (!localByPeriod[pbStat.period]) {
				const mapped = await statsPbToLocal(pbStat.totalMsPlayed, pbStat.msPerPosition);
				await db.matchStats.add({
					matchId: /** @type {number} */ (localMatch.id),
					period: pbStat.period,
					...mapped
				});
			}
		}
	}
}

export async function pushMatchStats(matchLocalId, period) {
	if (!isConnected()) return;
	const match = await db.matches.get(matchLocalId);
	if (!match?.pbId) return;

	const local = await db.matchStats
		.where('matchId').equals(matchLocalId)
		.and((s) => s.period === period)
		.first();
	if (!local) return;

	const mapped = await statsLocalToPb(local.totalMsPlayed, local.msPerPosition);
	const data = { match: match.pbId, period, ...mapped };

	const existing = await client()
		.collection('match_stats')
		.getFullList({ filter: `match="${match.pbId}" && period=${period}` })
		.catch(() => /** @type {any[]} */ ([]));

	if (existing.length > 0) {
		await client().collection('match_stats').update(existing[0].id, data).catch(console.error);
	} else {
		await client().collection('match_stats').create(data).catch(console.error);
	}
}
