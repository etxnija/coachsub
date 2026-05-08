<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getMatch, getPlayers, getMatchPlayers, saveMatchStats, saveSubEvent, updateMatch } from '$lib/db.js';
	import { parseFormation, slotId } from '$lib/formation.js';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import Pitch from '$lib/Pitch.svelte';

	/**
	 * @typedef {Object} GameChip
	 * @property {number} id
	 * @property {string} name
	 * @property {number} number
	 * @property {number} totalMs
	 * @property {number} stintMs
	 * @property {Record<string, number>} msPerPosition
	 * @property {string | null} position
	 * @property {'A' | 'B' | null} group
	 */

	/** @type {import('$lib/db.js').Match | null} */
	let match = null;
	let loading = true;

	// Clock state
	let clockMs = 0;
	let running = false;
	let currentPeriod = 1;
	let totalPeriods = 2;
	let periodDurationMs = 1200000;
	let betweenPeriods = false;
	let matchComplete = false;
	/** @type {ReturnType<typeof setInterval> | null} */
	let timerInterval = null;
	let lastTickAt = 0;

	// Formation/game state
	/** @type {{ id: string, position: string, type: string, items: GameChip[] }[]} */
	let slots = [];
	/** @type {GameChip[]} */
	let benchA = [];
	/** @type {GameChip[]} */
	let benchB = [];
	/** @type {GameChip[]} */
	let benchAll = []; // used when !useGroups
	/** @type {GameChip[]} */
	let benchGK = [];
	/** @type {{ type: string, positions: string[] }[]} */
	let formationRows = [];
	/** @type {Set<string>} */
	let groupASet = new Set();
	let useGroups = true;

	// Orientation: 'bottom' | 'left' | 'right'
	let orientation = 'bottom';

	// DnD state
	/** @type {Record<string, GameChip[]>} */
	let preDropOccupants = {};
	/** @type {'A' | 'B' | 'GK' | 'ALL' | null} */
	let benchDragGroup = null;
	/** @type {GameChip | null} */
	let pendingDisplaced = null;

	const FLIP_MS = 150;

	const orientLabels = { bottom: 'bot', left: 'left', right: 'right' };
	$: orientTransform =
		{ bottom: '', left: 'rotate(-90deg)', right: 'rotate(90deg)' }[orientation] ?? '';

	// Max bench stint per group (for the time bar indicator)
	$: maxStintA = benchA.length > 0 ? Math.max(...benchA.map((c) => c.stintMs)) : 0;
	$: maxStintB = benchB.length > 0 ? Math.max(...benchB.map((c) => c.stintMs)) : 0;
	$: maxStintAll = benchAll.length > 0 ? Math.max(...benchAll.map((c) => c.stintMs)) : 0;

	function cycleOrientation() {
		const order = ['bottom', 'left', 'right'];
		orientation = order[(order.indexOf(orientation) + 1) % 3];
	}

	/** @param {number} ms */
	function fmt(ms) {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return `${m}:${String(s % 60).padStart(2, '0')}`;
	}

	onMount(async () => {
		const id = parseInt($page.params.id ?? '', 10);
		const [fetchedMatch, players, matchPlayers] = await Promise.all([
			getMatch(id),
			getPlayers(),
			getMatchPlayers(id)
		]);
		match = fetchedMatch ?? null;

		if (!match) {
			loading = false;
			return;
		}

		// Guard: redirect if match is already complete
		if (match.status === 'complete') {
			goto(`/match/${match.id}/stats`);
			return;
		}

		totalPeriods = match.periods ?? 2;
		periodDurationMs = (match.duration ?? 20) * 60 * 1000;

		buildGameState(players, matchPlayers);
		loading = false;
		startClock();
	});

	onDestroy(() => {
		if (timerInterval !== null) clearInterval(timerInterval);
	});

	/**
	 * @param {import('$lib/db.js').Player[]} players
	 * @param {import('$lib/db.js').MatchPlayer[]} matchPlayers
	 */
	function buildGameState(players, matchPlayers) {
		if (!match) return;
		formationRows = parseFormation(match.formation);
		groupASet = new Set(match.groupASlots ?? []);
		useGroups = match.useGroups ?? true;

		const included = new Set(matchPlayers.map((mp) => mp.playerId));

		slots = formationRows.flatMap((row) =>
			row.positions.map((pos) => ({
				id: slotId(row.type, pos),
				position: pos,
				type: row.type,
				items: /** @type {GameChip[]} */ ([])
			}))
		);

		for (const mp of matchPlayers) {
			if (mp.starting && mp.matchPosition) {
				const slot = slots.find((s) => s.position === mp.matchPosition);
				const player = players.find((p) => p.id === mp.playerId);
				if (slot && player?.id !== undefined) {
					slot.items = [
						{
							id: player.id,
							name: player.name,
							number: player.number,
							totalMs: 0,
							stintMs: 0,
							msPerPosition: {},
							position: mp.matchPosition,
							group: groupASet.has(slot.id) ? 'A' : 'B'
						}
					];
				}
			}
		}

		const startingIds = new Set(slots.flatMap((s) => s.items.map((c) => c.id)));
		const allBench = players
			.filter((p) => p.id !== undefined && included.has(p.id) && !startingIds.has(p.id))
			.map((p) => {
				const mp = matchPlayers.find((m) => m.playerId === p.id);
				/** @type {'A' | 'B' | null} */
				const group = mp ? mp.rotationGroup ?? 'A' : 'A';
				return {
					id: /** @type {number} */ (p.id),
					name: p.name,
					number: p.number,
					totalMs: 0,
					stintMs: 0,
					msPerPosition: {},
					position: null,
					group: mp ? mp.rotationGroup : group
				};
			});

		benchGK = allBench.filter((c) => c.group === null);
		if (useGroups) {
			benchA = allBench.filter((c) => c.group === 'A');
			benchB = allBench.filter((c) => c.group === 'B');
			benchAll = [];
		} else {
			benchAll = allBench.filter((c) => c.group !== null);
			benchA = [];
			benchB = [];
		}
	}

	function startClock() {
		if (running) return;
		running = true;
		lastTickAt = Date.now();
		timerInterval = setInterval(tick, 1000);
	}

	function pauseClock() {
		if (!running) return;
		running = false;
		if (timerInterval !== null) clearInterval(timerInterval);
		timerInterval = null;
		applyElapsed(Date.now() - lastTickAt);
	}

	function tick() {
		const now = Date.now();
		const elapsed = now - lastTickAt;
		lastTickAt = now;
		applyElapsed(elapsed);
		if (clockMs >= periodDurationMs && running) {
			endPeriod();
		}
	}

	/** @param {number} elapsed */
	function applyElapsed(elapsed) {
		clockMs += elapsed;
		for (const slot of slots) {
			for (const chip of slot.items) {
				chip.totalMs += elapsed;
				chip.stintMs += elapsed;
				if (chip.position) {
					chip.msPerPosition[chip.position] = (chip.msPerPosition[chip.position] ?? 0) + elapsed;
				}
			}
		}
		if (useGroups) {
			for (const chip of benchA) chip.stintMs += elapsed;
			for (const chip of benchB) chip.stintMs += elapsed;
			benchA = benchA;
			benchB = benchB;
		} else {
			for (const chip of benchAll) chip.stintMs += elapsed;
			benchAll = benchAll;
		}
		for (const chip of benchGK) chip.stintMs += elapsed;
		slots = slots;
		benchGK = benchGK;
	}

	function toggleClock() {
		if (running) pauseClock();
		else startClock();
	}

	async function endPeriod() {
		pauseClock();
		await persistStats();
		if (currentPeriod >= totalPeriods) {
			matchComplete = true;
			if (match?.id) await updateMatch(match.id, { status: 'complete' });
		} else {
			betweenPeriods = true;
		}
	}

	function startNextPeriod() {
		currentPeriod++;
		clockMs = 0;
		betweenPeriods = false;
		startClock();
	}

	async function persistStats() {
		if (!match?.id) return;
		/** @type {Record<number, number>} */
		const totalMsPlayed = {};
		/** @type {Record<number, Record<string, number>>} */
		const msPerPosition = {};
		for (const slot of slots) {
			for (const chip of slot.items) {
				totalMsPlayed[chip.id] = chip.totalMs;
				msPerPosition[chip.id] = { ...chip.msPerPosition };
			}
		}
		const allBenchChips = useGroups ? [...benchA, ...benchB, ...benchGK] : [...benchAll, ...benchGK];
		for (const chip of allBenchChips) {
			totalMsPlayed[chip.id] = chip.totalMs;
			msPerPosition[chip.id] = { ...chip.msPerPosition };
		}
		await saveMatchStats(match.id, currentPeriod, { totalMsPlayed, msPerPosition });
	}

	// DnD handlers
	/** @param {string} sid @param {CustomEvent} e */
	function handleSlotConsider(sid, e) {
		const t = slots.find((s) => s.id === sid);
		if (t) {
			if (!(sid in preDropOccupants)) {
				preDropOccupants[sid] = [...t.items];
			}
			t.items = e.detail.items;
			slots = slots;
		}
	}

	/** @param {string} sid @param {CustomEvent} e */
	async function handleSlotFinalize(sid, e) {
		const t = slots.find((s) => s.id === sid);
		if (!t) return;

		const incoming = /** @type {GameChip} */ (e.detail.items[0]);
		const originalOccupant = preDropOccupants[sid]?.[0];
		delete preDropOccupants[sid];

		const displaced =
			originalOccupant && incoming && originalOccupant.id !== incoming.id
				? originalOccupant
				: null;

		if (displaced) {
			const d = { ...displaced, stintMs: 0, position: null };
			if (benchDragGroup !== null) {
				// Bench→slot: defer to bench finalize to avoid mid-drag DOM errors
				pendingDisplaced = d;
			} else {
				// Slot→slot: add displaced directly to correct bench array
				const onBench = useGroups
					? benchA.some((c) => c.id === d.id) || benchB.some((c) => c.id === d.id)
					: benchAll.some((c) => c.id === d.id);
				const onBenchGK = benchGK.some((c) => c.id === d.id);
				const inSlot = slots.some(
					(s) => s.id !== sid && s.items.some((c) => c.id === d.id)
				);
				if (!onBench && !onBenchGK && !inSlot) {
					if (d.group === null) {
						benchGK = [...benchGK, d];
					} else if (useGroups) {
						if (d.group === 'A') benchA = [...benchA, d];
						else benchB = [...benchB, d];
					} else {
						benchAll = [...benchAll, d];
					}
				}
			}
			if (incoming && match?.id) {
				saveSubEvent({
					matchId: match.id,
					period: currentPeriod,
					clockMs,
					playerInId: incoming.id,
					playerOutId: displaced.id,
					position: t.position
				}).catch((err) => console.error('saveSubEvent failed:', err));
			}
		}

		t.items = incoming
			? [{ ...incoming, stintMs: displaced ? 0 : incoming.stintMs, position: t.position }]
			: [];
		slots = slots;
		if (incoming) {
			if (useGroups) {
				benchA = benchA.filter((c) => c.id !== incoming.id);
				benchB = benchB.filter((c) => c.id !== incoming.id);
			} else {
				benchAll = benchAll.filter((c) => c.id !== incoming.id);
			}
			benchGK = benchGK.filter((c) => c.id !== incoming.id);
		}
	}

	/**
	 * @param {'A' | 'B' | 'GK' | 'ALL'} group
	 * @param {CustomEvent} e
	 */
	function handleBenchConsider(group, e) {
		benchDragGroup = group;
		if (group === 'A') benchA = e.detail.items;
		else if (group === 'B') benchB = e.detail.items;
		else if (group === 'GK') benchGK = e.detail.items;
		else benchAll = e.detail.items;
	}

	/**
	 * @param {'A' | 'B' | 'GK' | 'ALL'} group
	 * @param {CustomEvent} e
	 */
	function handleBenchFinalize(group, e) {
		benchDragGroup = null;

		const finalItems = /** @type {GameChip[]} */ (
			e.detail.items.map((c) => ({ ...c, position: null }))
		);

		if (group === 'A') benchA = finalItems;
		else if (group === 'B') benchB = finalItems;
		else if (group === 'GK') benchGK = finalItems;
		else benchAll = finalItems;

		// Add any displaced player stashed by slot finalize
		if (pendingDisplaced) {
			const d = pendingDisplaced;
			pendingDisplaced = null;
			if (d.group === null) {
				benchGK = [...benchGK, d];
			} else if (useGroups) {
				if (d.group === 'A') benchA = [...benchA, d];
				else benchB = [...benchB, d];
			} else {
				benchAll = [...benchAll, d];
			}
		}

		// Sort by bench time descending (longest bench = NEXT)
		benchA = [...benchA].sort((a, b) => b.stintMs - a.stintMs);
		benchB = [...benchB].sort((a, b) => b.stintMs - a.stintMs);
		benchAll = [...benchAll].sort((a, b) => b.stintMs - a.stintMs);

		// Remove from slots any player now on bench
		const allBenchIds = new Set(
			[...(useGroups ? [...benchA, ...benchB] : benchAll), ...benchGK].map((c) => c.id)
		);
		for (const slot of slots) {
			slot.items = slot.items.filter((c) => !allBenchIds.has(c.id));
		}
		slots = slots;
	}

	$: clockDisplay = fmt(clockMs);
</script>

<svelte:head>
	<title>{match?.name ?? 'Game'} · CoachSub</title>
</svelte:head>

<div class="flex h-screen flex-col bg-gray-50">
	<!-- Header -->
	<header class="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
		<div class="flex items-center gap-3">
			<button
				on:click={() => goto(`/match/${match?.id}`)}
				class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
				aria-label="Back to setup"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-5 w-5"
				>
					<path
						fill-rule="evenodd"
						d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
			<div class="min-w-0 flex-1">
				<p class="truncate text-base font-bold text-gray-900">{match?.name ?? '…'}</p>
				<p class="text-xs text-gray-500">
					{#if matchComplete}
						Match complete
					{:else if betweenPeriods}
						Period {currentPeriod} ended
					{:else}
						Period {currentPeriod} of {totalPeriods}
					{/if}
				</p>
			</div>
			<!-- Orientation toggle -->
			<button
				on:click={cycleOrientation}
				class="flex flex-shrink-0 flex-col items-center justify-center rounded-xl bg-gray-100 px-2 py-1 active:bg-gray-200"
				title="Rotate field view"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-4 w-4 text-gray-600"
				>
					<path
						fill-rule="evenodd"
						d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H5.498a.75.75 0 00-.75.75v3.734a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V3.198a.75.75 0 00-1.5 0v2.433l-.31-.31A7 7 0 003.239 8.458a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.38l.311.311h-2.432a.75.75 0 000 1.5h3.733a.75.75 0 00.531-.22z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="text-[9px] font-semibold uppercase text-gray-500"
					>{orientLabels[orientation]}</span
				>
			</button>
		</div>
	</header>

	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<div
				class="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"
			></div>
		</div>
	{:else if !match}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<p class="text-gray-500">Match not found</p>
			<button on:click={() => goto('/matches')} class="text-blue-700 underline"
				>Back to matches</button
			>
		</div>
	{:else}
		<!-- Clock bar -->
		<div class="border-b border-gray-100 bg-white px-4 py-3">
			{#if betweenPeriods}
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-xs font-medium text-gray-500">Period ended at</p>
						<p class="font-mono text-2xl font-bold text-gray-700">{clockDisplay}</p>
					</div>
					<button
						on:click={startNextPeriod}
						class="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white active:bg-blue-800"
					>
						Start Period {currentPeriod + 1}
					</button>
				</div>
			{:else}
				<div class="flex items-center gap-3">
					<div class="w-24 font-mono text-4xl font-bold tabular-nums text-gray-900">
						{clockDisplay}
					</div>
					<div class="flex flex-1 gap-2">
						<button
							on:click={toggleClock}
							class="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white {running
								? 'bg-amber-500 active:bg-amber-600'
								: 'bg-green-600 active:bg-green-700'}"
						>
							{running ? 'Pause' : 'Resume'}
						</button>
						<button
							on:click={endPeriod}
							class="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white active:bg-red-600"
						>
							End Period
						</button>
					</div>
				</div>
				<!-- Period progress bar -->
				<div class="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
					<div
						class="h-full rounded-full bg-blue-500 transition-none"
						style="width: {Math.min(100, (clockMs / periodDurationMs) * 100)}%"
					></div>
				</div>
			{/if}
		</div>

		<!-- Pitch area: half-pitch, fills remaining height -->
		<div class="mx-3 my-2 min-h-0 flex-1">
			<Pitch
				{slots}
				{formationRows}
				{groupASet}
				flipMs={FLIP_MS}
				transform={orientTransform}
				onConsider={handleSlotConsider}
				onFinalize={handleSlotFinalize}
			>
				<svelte:fragment slot="chip" let:chip let:isGroupA let:isGK let:pitchSlot>
					<span class="text-sm font-bold leading-none text-blue-700">{chip.number}</span>
					<span class="max-w-full truncate text-[9px] font-medium leading-tight text-gray-700">{chip.name.split(' ')[0]}</span>
					<span class="text-[8px] font-semibold leading-tight {isGK ? 'text-gray-500' : isGroupA ? 'text-orange-500' : 'text-teal-600'}">{pitchSlot.position}</span>
					<span class="text-[7px] leading-tight text-gray-400">{fmt(chip.totalMs)}</span>
					<span class="text-[7px] font-semibold leading-tight text-green-600">{fmt(chip.stintMs)}</span>
				</svelte:fragment>
			</Pitch>
		</div>

		<!-- Bench -->
		<div class="border-t border-gray-200 bg-white px-4 pb-3 pt-2">
			{#if useGroups}
				<!-- Group A -->
				<div class="mb-2">
					<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-orange-500">
						● Group A {#if benchA.length > 0}— next: #{benchA[0].number}{/if}
					</p>
					<div
						use:dndzone={{ items: benchA, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
						on:consider={(e) => handleBenchConsider('A', e)}
						on:finalize={(e) => handleBenchFinalize('A', e)}
						class="flex min-h-[3.5rem] flex-wrap gap-1.5"
					>
						{#each benchA as chip, i (chip.id)}
							{@const barPct = maxStintA > 0 ? Math.round((chip.stintMs / maxStintA) * 100) : 0}
							<div
								animate:flip={{ duration: FLIP_MS }}
								class="relative flex h-16 w-[3.25rem] flex-shrink-0 flex-col items-center justify-center rounded-xl bg-blue-700 px-1 pb-2 shadow-sm ring-2 ring-orange-400/60"
							>
								{#if i === 0}
									<span
										class="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange-400 px-1.5 text-[7px] font-bold leading-4 text-white"
										>NEXT</span
									>
								{/if}
								<span class="text-base font-bold leading-none text-white">{chip.number}</span>
								<span class="max-w-full truncate text-[9px] font-medium leading-tight text-blue-100"
									>{chip.name.split(' ')[0]}</span
								>
								<span class="text-[7px] leading-tight text-blue-200">{fmt(chip.totalMs)}</span>
								<!-- bench wait bar -->
								<div class="absolute bottom-1.5 left-1.5 right-1.5 h-0.5 overflow-hidden rounded-full bg-white/20">
									<div class="h-full rounded-full bg-yellow-300" style="width: {barPct}%"></div>
								</div>
							</div>
						{/each}
						{#if benchA.length === 0}
							<p class="py-2 text-sm text-gray-400">No Group A subs</p>
						{/if}
					</div>
				</div>

				<!-- Group B -->
				<div>
					<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-teal-600">
						● Group B {#if benchB.length > 0}— next: #{benchB[0].number}{/if}
					</p>
					<div
						use:dndzone={{ items: benchB, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
						on:consider={(e) => handleBenchConsider('B', e)}
						on:finalize={(e) => handleBenchFinalize('B', e)}
						class="flex min-h-[3.5rem] flex-wrap gap-1.5"
					>
						{#each benchB as chip, i (chip.id)}
							{@const barPct = maxStintB > 0 ? Math.round((chip.stintMs / maxStintB) * 100) : 0}
							<div
								animate:flip={{ duration: FLIP_MS }}
								class="relative flex h-16 w-[3.25rem] flex-shrink-0 flex-col items-center justify-center rounded-xl bg-blue-700 px-1 pb-2 shadow-sm ring-2 ring-teal-500/60"
							>
								{#if i === 0}
									<span
										class="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-teal-500 px-1.5 text-[7px] font-bold leading-4 text-white"
										>NEXT</span
									>
								{/if}
								<span class="text-base font-bold leading-none text-white">{chip.number}</span>
								<span class="max-w-full truncate text-[9px] font-medium leading-tight text-blue-100"
									>{chip.name.split(' ')[0]}</span
								>
								<span class="text-[7px] leading-tight text-blue-200">{fmt(chip.totalMs)}</span>
								<!-- bench wait bar -->
								<div class="absolute bottom-1.5 left-1.5 right-1.5 h-0.5 overflow-hidden rounded-full bg-white/20">
									<div class="h-full rounded-full bg-yellow-300" style="width: {barPct}%"></div>
								</div>
							</div>
						{/each}
						{#if benchB.length === 0}
							<p class="py-2 text-sm text-gray-400">No Group B subs</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Ungrouped bench -->
				<div>
					<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
						● Bench {#if benchAll.length > 0}— next: #{benchAll[0].number}{/if}
					</p>
					<div
						use:dndzone={{ items: benchAll, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
						on:consider={(e) => handleBenchConsider('ALL', e)}
						on:finalize={(e) => handleBenchFinalize('ALL', e)}
						class="flex min-h-[3.5rem] flex-wrap gap-1.5"
					>
						{#each benchAll as chip, i (chip.id)}
							{@const barPct = maxStintAll > 0 ? Math.round((chip.stintMs / maxStintAll) * 100) : 0}
							<div
								animate:flip={{ duration: FLIP_MS }}
								class="relative flex h-16 w-[3.25rem] flex-shrink-0 flex-col items-center justify-center rounded-xl bg-blue-700 px-1 pb-2 shadow-sm"
							>
								{#if i === 0}
									<span
										class="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-500 px-1.5 text-[7px] font-bold leading-4 text-white"
										>NEXT</span
									>
								{/if}
								<span class="text-base font-bold leading-none text-white">{chip.number}</span>
								<span class="max-w-full truncate text-[9px] font-medium leading-tight text-blue-100"
									>{chip.name.split(' ')[0]}</span
								>
								<span class="text-[7px] leading-tight text-blue-200">{fmt(chip.totalMs)}</span>
								<!-- bench wait bar -->
								<div class="absolute bottom-1.5 left-1.5 right-1.5 h-0.5 overflow-hidden rounded-full bg-white/20">
									<div class="h-full rounded-full bg-yellow-300" style="width: {barPct}%"></div>
								</div>
							</div>
						{/each}
						{#if benchAll.length === 0}
							<p class="py-2 text-sm text-gray-400">No subs</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- GK (no rotation group) -->
			{#if benchGK.length > 0}
				<div class="mt-1">
					<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">● GK</p>
					<div
						use:dndzone={{ items: benchGK, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
						on:consider={(e) => handleBenchConsider('GK', e)}
						on:finalize={(e) => handleBenchFinalize('GK', e)}
						class="flex min-h-[3rem] flex-wrap gap-1.5"
					>
						{#each benchGK as chip (chip.id)}
							<div
								animate:flip={{ duration: FLIP_MS }}
								class="flex h-16 w-[3.25rem] flex-shrink-0 flex-col items-center justify-center rounded-xl bg-gray-500 px-1 shadow-sm"
							>
								<span class="text-base font-bold leading-none text-white">{chip.number}</span>
								<span class="max-w-full truncate text-[9px] font-medium leading-tight text-gray-200">{chip.name.split(' ')[0]}</span>
								<span class="text-[7px] leading-tight text-gray-300">{fmt(chip.totalMs)}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Match Complete overlay -->
{#if matchComplete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
		<div class="mx-6 rounded-2xl bg-white p-8 text-center shadow-2xl">
			<p class="text-5xl">⚽</p>
			<p class="mt-3 text-2xl font-bold text-gray-900">Match Complete!</p>
			<p class="mt-1 text-gray-500">{match?.name}</p>
			<button
				on:click={() => goto(`/match/${match?.id}/stats`)}
				class="btn-primary mt-6"
			>View Stats</button>
			<button
				on:click={() => goto('/matches')}
				class="mt-3 block w-full text-center text-sm text-gray-500 underline"
			>Back to Matches</button>
		</div>
	</div>
{/if}
