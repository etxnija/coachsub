<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getMatch, getPlayers, getMatchPlayers, saveMatchPlayers, updateMatch } from '$lib/db.js';
	import { parseFormation, slotId } from '$lib/formation.js';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import Pitch from '$lib/Pitch.svelte';

	/** @type {import('$lib/db.js').Match | null} */
	let match = null;
	/** @type {import('$lib/db.js').Player[]} */
	let allPlayers = [];
	let loading = true;

	// Tab state: 'roster' | 'formation'
	let tab = 'roster';

	// --- Roster tab state ---
	let included = new Set();

	// --- Formation tab state ---
	/**
	 * @typedef {{ id: number, name: string, number: number, group: 'A' | 'B' }} BenchChip
	 * @typedef {{ id: string, position: string, type: string, items: {id: number, name: string, number: number}[] }} Slot
	 */
	/** @type {Slot[]} */
	let slots = [];
	/** @type {BenchChip[]} */
	let bench = [];
	/** @type {{ type: string, positions: string[] }[]} */
	let formationRows = [];
	/** @type {Set<string>} */
	let groupASlots = new Set();

	/** @type {Record<string, {id: number, name: string, number: number}[]>} */
	let preDropOccupants = {};
	let benchDragActive = false;
	/** @type {BenchChip | null} */
	let pendingDisplaced = null;

	const FLIP_MS = 200;

	$: groupAPositions = slots.filter((s) => groupASlots.has(s.id)).map((s) => s.position);
	$: groupBPositions = slots.filter((s) => !groupASlots.has(s.id)).map((s) => s.position);
	$: startingCount = slots.filter((s) => s.items.length > 0).length;

	onMount(async () => {
		const id = parseInt($page.params.id ?? '', 10);
		const [fetchedMatch, players] = await Promise.all([getMatch(id), getPlayers()]);
		match = fetchedMatch ?? null;
		allPlayers = players;
		if (!match) { loading = false; return; }
		const existing = await getMatchPlayers(id);
		included = existing.length === 0
			? new Set(allPlayers.filter((p) => p.id !== undefined).map((p) => p.id))
			: new Set(existing.map((mp) => mp.playerId));
		buildFormationState(existing);
		loading = false;
	});

	/** @param {import('$lib/db.js').MatchPlayer[]} existing */
	function buildFormationState(existing) {
		if (!match) return;
		formationRows = parseFormation(match.formation);
		slots = formationRows.flatMap((row) =>
			row.positions.map((pos) => ({ id: slotId(row.type, pos), position: pos, type: row.type, items: [] }))
		);

		if (match.groupASlots && match.groupASlots.length > 0) {
			groupASlots = new Set(match.groupASlots);
		} else {
			const halfIdx = Math.ceil(formationRows.length / 2);
			groupASlots = new Set(
				formationRows.slice(0, halfIdx).flatMap((row) =>
					row.positions.map((pos) => slotId(row.type, pos))
				)
			);
		}

		for (const mp of existing) {
			if (mp.starting && mp.matchPosition) {
				const slot = slots.find((s) => s.position === mp.matchPosition);
				const player = allPlayers.find((p) => p.id === mp.playerId);
				if (slot && player?.id !== undefined) {
					slot.items = [{ id: player.id, name: player.name, number: player.number }];
				}
			}
		}

		const startingIds = new Set(slots.flatMap((s) => s.items.map((i) => i.id)));
		bench = allPlayers
			.filter((p) => p.id !== undefined && included.has(p.id) && !startingIds.has(p.id))
			.map((p) => {
				const mp = existing.find((e) => e.playerId === p.id);
				return {
					id: /** @type {number} */ (p.id),
					name: p.name,
					number: p.number,
					group: mp?.rotationGroup ?? defaultGroupForPlayer(p)
				};
			});
	}

	/** @param {import('$lib/db.js').Player} player @returns {'A' | 'B'} */
	function defaultGroupForPlayer(player) {
		return player.position === 'D' || player.position === 'G' ? 'B' : 'A';
	}

	/** @param {number} playerId */
	function togglePlayer(playerId) {
		const next = new Set(included);
		if (next.has(playerId)) {
			next.delete(playerId);
			bench = bench.filter((p) => p.id !== playerId);
			for (const slot of slots) slot.items = slot.items.filter((p) => p.id !== playerId);
			slots = slots;
		} else {
			next.add(playerId);
			const player = allPlayers.find((p) => p.id === playerId);
			bench = [...bench, {
				id: playerId,
				name: player?.name ?? '',
				number: player?.number ?? 0,
				group: player ? defaultGroupForPlayer(player) : 'A'
			}];
		}
		included = next;
		persistRoster();
	}

	/** @param {string} sid */
	function toggleSlotGroup(sid) {
		if (groupASlots.has(sid)) groupASlots.delete(sid);
		else groupASlots.add(sid);
		groupASlots = groupASlots;
		persistRoster();
	}

	/** @param {number} playerId */
	function toggleBenchGroup(playerId) {
		const chip = bench.find((b) => b.id === playerId);
		if (chip) { chip.group = chip.group === 'A' ? 'B' : 'A'; bench = bench; }
		persistRoster();
	}

	async function persistRoster() {
		if (!match?.id) return;
		await updateMatch(match.id, { groupASlots: [...groupASlots] });
		const startingByPosition = new Map(
			slots.filter((s) => s.items.length > 0).map((s) => [s.items[0].id, s.position])
		);
		const players = allPlayers
			.filter((p) => p.id !== undefined && included.has(p.id))
			.map((p) => {
				const pid = /** @type {number} */ (p.id);
				const isStarting = startingByPosition.has(pid);
				/** @type {'A' | 'B' | null} */
				let rotationGroup = null;
				if (isStarting) {
					const slot = slots.find((s) => s.items.some((i) => i.id === pid));
					rotationGroup = slot && groupASlots.has(slot.id) ? 'A' : 'B';
				} else {
					rotationGroup = bench.find((b) => b.id === pid)?.group ?? 'A';
				}
				return {
					matchId: /** @type {number} */ (match?.id),
					playerId: pid,
					starting: isStarting,
					matchPosition: /** @type {import('$lib/db.js').MatchPosition} */ (startingByPosition.get(pid) ?? null),
					rotationGroup
				};
			});
		await saveMatchPlayers(/** @type {number} */ (match.id), players);
	}

	// --- DnD handlers ---
	/** @param {string} sid @param {CustomEvent} e */
	function handleSlotConsider(sid, e) {
		const target = slots.find((s) => s.id === sid);
		if (target) {
			if (!(sid in preDropOccupants)) preDropOccupants[sid] = [...target.items];
			target.items = e.detail.items;
			slots = slots;
		}
	}

	/** @param {string} sid @param {CustomEvent} e */
	function handleSlotFinalize(sid, e) {
		const target = slots.find((s) => s.id === sid);
		if (!target) return;
		const incomingPlayer = e.detail.items[0];
		const originalOccupant = preDropOccupants[sid]?.[0];
		delete preDropOccupants[sid];
		const displaced = originalOccupant && incomingPlayer && originalOccupant.id !== incomingPlayer.id
			? originalOccupant : null;
		if (displaced) {
			const displacedGroup = groupASlots.has(sid) ? 'A' : 'B';
			if (benchDragActive) {
				pendingDisplaced = { ...displaced, group: displacedGroup };
			} else {
				const alreadyOnBench = bench.some((p) => p.id === displaced.id);
				const alreadyInSlot = slots.some((s) => s.id !== sid && s.items.some((p) => p.id === displaced.id));
				if (!alreadyOnBench && !alreadyInSlot) bench = [...bench, { ...displaced, group: displacedGroup }];
			}
		}
		target.items = incomingPlayer ? [incomingPlayer] : [];
		slots = slots;
		if (incomingPlayer) bench = bench.filter((p) => p.id !== incomingPlayer.id);
		persistRoster();
	}

	/** @param {any} e */
	function handleBenchConsider(e) {
		benchDragActive = true;
		bench = e.detail.items;
	}

	/** @param {any} e */
	function handleBenchFinalize(e) {
		const wasBenchDrag = benchDragActive;
		benchDragActive = false;
		/** @type {BenchChip[]} */
		const finalItems = e.detail.items;
		bench = wasBenchDrag
			? (pendingDisplaced ? [...finalItems, pendingDisplaced] : [...finalItems])
			: finalItems;
		pendingDisplaced = null;
		const benchIds = new Set(bench.map((p) => p.id));
		for (const slot of slots) slot.items = slot.items.filter((p) => !benchIds.has(p.id));
		slots = slots;
		persistRoster();
	}
</script>

<svelte:head>
	<title>{match ? match.name : 'Match'} · CoachSub</title>
</svelte:head>

<!-- h-screen so formation tab can use flex-1 for pitch without scrolling -->
<div class="flex h-screen flex-col">
	<!-- Compact header -->
	<header class="flex-shrink-0 border-b border-gray-200 bg-white shadow-sm">
		<div class="flex items-center gap-2 px-4 pt-3 pb-1">
			<button
				on:click={() => goto('/matches')}
				class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
				aria-label="Back"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
					<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
				</svg>
			</button>
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-base font-bold leading-tight text-gray-900">{match?.name ?? '…'}</h1>
				{#if match?.opponent}
					<p class="text-xs leading-tight text-gray-500">vs {match.opponent}</p>
				{/if}
			</div>
			{#if match}
				<button
					on:click={() => goto(`/match/${match?.id}/stats`)}
					class="flex-shrink-0 rounded-xl bg-gray-100 p-2 text-gray-600 active:bg-gray-200"
					aria-label="View stats"
					title="Match stats"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
						<path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 003 0v-13A1.5 1.5 0 0015.5 2zM9.5 6A1.5 1.5 0 008 7.5v9a1.5 1.5 0 003 0v-9A1.5 1.5 0 009.5 6zM3.5 10A1.5 1.5 0 002 11.5v5a1.5 1.5 0 003 0v-5A1.5 1.5 0 003.5 10z" />
					</svg>
				</button>
			{/if}
		</div>
		{#if match}
			<div class="flex rounded-xl bg-gray-100 mx-4 mt-1.5 mb-2 p-1">
				<button
					on:click={() => (tab = 'roster')}
					class="flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors {tab === 'roster' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}"
				>Roster ({included.size})</button>
				<button
					on:click={() => (tab = 'formation')}
					class="flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors {tab === 'formation' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}"
				>Formation ({startingCount}/{slots.length})</button>
			</div>
		{/if}
	</header>

	<!-- Content: flex-1 so formation tab can fill remaining height -->
	<main class="flex min-h-0 flex-1 flex-col">
		{#if loading}
			<div class="flex flex-1 items-center justify-center">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"></div>
			</div>
		{:else if !match}
			<div class="flex flex-1 flex-col items-center justify-center py-20 text-center">
				<p class="text-gray-500">Match not found</p>
				<button on:click={() => goto('/matches')} class="mt-4 text-blue-700 underline">Back to matches</button>
			</div>

		<!-- ROSTER TAB -->
		{:else if tab === 'roster'}
			<div class="flex-1 overflow-y-auto px-4 py-4">
				<p class="mb-3 text-sm text-gray-500">Toggle players in or out of this match.</p>
				{#if allPlayers.length === 0}
					<div class="py-12 text-center text-gray-400">No players in squad yet.</div>
				{:else}
					<ul class="space-y-2">
						{#each allPlayers as player (player.id)}
							<li>
								<button
									on:click={() => player.id !== undefined && togglePlayer(player.id)}
									class="flex w-full items-center gap-4 rounded-2xl px-4 py-3 transition-colors {included.has(player.id) ? 'bg-white shadow-sm' : 'bg-gray-50 opacity-50'}"
								>
									<div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white {included.has(player.id) ? 'bg-blue-700' : 'bg-gray-400'}">
										{player.number}
									</div>
									<div class="min-w-0 flex-1 text-left">
										<p class="truncate text-base font-semibold text-gray-900">{player.name}</p>
									</div>
									<div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full {included.has(player.id) ? 'bg-blue-700' : 'border-2 border-gray-300 bg-white'}">
										{#if included.has(player.id)}
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-white">
												<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
											</svg>
										{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
					<p class="mt-4 text-center text-sm text-gray-400">{included.size} of {allPlayers.length} players selected</p>
				{/if}
			</div>

		<!-- FORMATION TAB: fills remaining screen height, no scrolling -->
		{:else}
			<div class="flex min-h-0 flex-1 flex-col">

				<!-- Compact single-line group legend -->
				<div class="flex flex-shrink-0 items-center gap-1.5 border-b border-gray-100 px-4 py-1.5 text-xs">
					<span class="font-bold text-orange-500">●&nbsp;A</span>
					<span class="text-orange-400">{groupAPositions.join(' · ') || '—'}</span>
					<span class="mx-1 text-gray-300">|</span>
					<span class="font-bold text-teal-600">●&nbsp;B</span>
					<span class="text-teal-500">{groupBPositions.join(' · ') || '—'}</span>
				</div>

				<!-- Half-pitch: flex-1 fills remaining height -->
				<div class="mx-3 my-2 min-h-0 flex-1">
					<Pitch
						{slots}
						{formationRows}
						groupASet={groupASlots}
						flipMs={FLIP_MS}
						onConsider={handleSlotConsider}
						onFinalize={handleSlotFinalize}
						onGroupToggle={toggleSlotGroup}
					>
						<svelte:fragment slot="chip" let:chip let:isGroupA let:pitchSlot>
							<span class="text-sm font-bold leading-none text-blue-700">{chip.number}</span>
							<span class="max-w-full truncate text-[9px] font-medium leading-tight text-gray-700">{chip.name.split(' ')[0]}</span>
							<span class="text-[8px] font-semibold leading-tight {isGroupA ? 'text-orange-500' : 'text-teal-600'}">{pitchSlot.position}</span>
						</svelte:fragment>
					</Pitch>
				</div>

				<!-- Bench: compact, flex-shrink-0 -->
				<div class="flex-shrink-0 px-3 pb-1">
					<p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
						Bench ({bench.length})
					</p>
					<div
						use:dndzone={{ items: bench, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
						on:consider={handleBenchConsider}
						on:finalize={handleBenchFinalize}
						class="flex min-h-[3.5rem] flex-wrap gap-1.5 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-2"
					>
						{#each bench as chip (chip.id)}
							{@const isGroupA = chip.group === 'A'}
							<div
								animate:flip={{ duration: FLIP_MS }}
								class="relative flex h-14 w-[3.25rem] flex-shrink-0 flex-col items-center justify-center rounded-xl shadow-sm {isGroupA ? 'bg-orange-500' : 'bg-teal-600'}"
							>
								<button
									on:click|stopPropagation={() => toggleBenchGroup(chip.id)}
									class="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/50 text-[8px] font-bold text-white shadow {isGroupA ? 'bg-orange-300' : 'bg-teal-400'}"
									aria-label="Toggle group"
								>{isGroupA ? 'A' : 'B'}</button>
								<span class="text-sm font-bold leading-none text-white">{chip.number}</span>
								<span class="max-w-full truncate px-1 text-[9px] font-medium leading-tight text-white/90">{chip.name.split(' ')[0]}</span>
							</div>
						{/each}
						{#if bench.length === 0}
							<p class="w-full text-center text-sm text-gray-400">All players assigned</p>
						{/if}
					</div>
				</div>

				<!-- Start Match -->
				<div class="flex-shrink-0 px-3 pb-3 pt-2">
					<button
						on:click={() => match?.id !== undefined && goto(`/match/${match.id}/game`)}
						class="btn-primary"
					>Start Match</button>
				</div>
			</div>
		{/if}
	</main>
</div>
