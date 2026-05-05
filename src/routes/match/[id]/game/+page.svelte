<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getMatch, getPlayers, getMatchPlayers, saveMatchStats, saveSubEvent } from '$lib/db.js';
	import { parseFormation, slotId } from '$lib/formation.js';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	/**
	 * @typedef {Object} GameChip
	 * @property {number} id
	 * @property {string} name
	 * @property {number} number
	 * @property {number} totalMs
	 * @property {number} stintMs
	 * @property {Record<string, number>} msPerPosition
	 * @property {string | null} position
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
	let bench = [];
	/** @type {{ type: string, positions: string[] }[]} */
	let formationRows = [];

	// Orientation: 'bottom' | 'left' | 'right'
	let orientation = 'bottom';

	const FLIP_MS = 150;

	const orientLabels = { bottom: 'bot', left: 'left', right: 'right' };
	$: orientTransform =
		{ bottom: '', left: 'rotate(-90deg)', right: 'rotate(90deg)' }[orientation] ?? '';

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
							position: mp.matchPosition
						}
					];
				}
			}
		}

		const startingIds = new Set(slots.flatMap((s) => s.items.map((c) => c.id)));
		bench = players
			.filter((p) => p.id !== undefined && included.has(p.id) && !startingIds.has(p.id))
			.map((p) => ({
				id: /** @type {number} */ (p.id),
				name: p.name,
				number: p.number,
				totalMs: 0,
				stintMs: 0,
				msPerPosition: {},
				position: null
			}));
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
		// Auto-end when period time expires
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
		for (const chip of bench) {
			chip.stintMs += elapsed;
		}
		slots = slots;
		bench = bench;
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
		for (const chip of bench) {
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
			t.items = e.detail.items;
			slots = slots;
		}
	}

	/** @param {string} sid @param {CustomEvent} e */
	async function handleSlotFinalize(sid, e) {
		const t = slots.find((s) => s.id === sid);
		if (!t) return;

		const incoming = /** @type {GameChip} */ (e.detail.items[0]);
		const displaced = t.items.find((c) => c.id !== incoming?.id);

		if (displaced) {
			const onBench = bench.some((c) => c.id === displaced.id);
			const inSlot = slots.some((s) => s.id !== sid && s.items.some((c) => c.id === displaced.id));
			if (!onBench && !inSlot) {
				bench = [...bench, { ...displaced, stintMs: 0, position: null }];
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
		if (incoming) bench = bench.filter((c) => c.id !== incoming.id);
	}

	/** @param {CustomEvent} e */
	function handleBenchConsider(e) {
		bench = e.detail.items;
	}

	/** @param {CustomEvent} e */
	function handleBenchFinalize(e) {
		bench = e.detail.items.map((c) => ({ ...c, position: null }));
		const ids = new Set(bench.map((c) => c.id));
		for (const slot of slots) {
			const prev = slot.items.length;
			slot.items = slot.items.filter((c) => !ids.has(c.id));
			if (slot.items.length !== prev) slots = slots;
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

		<!-- Pitch area -->
		<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
			<div
				class="relative overflow-hidden rounded-2xl bg-green-700"
				style="max-height: 100%; aspect-ratio: 9 / 13; max-width: calc(100% - 0.5rem)"
			>
				<!-- Orientation transform wrapper -->
				<div
					class="absolute inset-0"
					style="transform: {orientTransform}; transform-origin: center center; transition: transform 0.3s ease"
				>
					<!-- Pitch markings SVG -->
					<svg
						class="absolute inset-0 h-full w-full"
						viewBox="0 0 90 130"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<rect
							x="2"
							y="2"
							width="86"
							height="126"
							rx="2"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1.5"
						/>
						<line x1="2" y1="65" x2="88" y2="65" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
						<circle cx="45" cy="65" r="12" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
						<rect
							x="20"
							y="2"
							width="50"
							height="20"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1"
						/>
						<rect
							x="20"
							y="108"
							width="50"
							height="20"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1"
						/>
						<rect
							x="33"
							y="0"
							width="24"
							height="4"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1"
						/>
						<rect
							x="33"
							y="126"
							width="24"
							height="4"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1"
						/>
					</svg>

					<!-- Formation rows -->
					<div class="absolute inset-0 flex flex-col justify-around py-3">
						{#each formationRows as row}
							<div class="flex justify-around px-1">
								{#each row.positions as pos}
									{@const slot = slots.find((s) => s.id === slotId(row.type, pos))}
									{#if slot}
										<div
											use:dndzone={{
												items: slot.items,
												flipDurationMs: FLIP_MS,
												dropTargetStyle: {}
											}}
											on:consider={(e) => handleSlotConsider(slot.id, e)}
											on:finalize={(e) => handleSlotFinalize(slot.id, e)}
											class="relative flex h-20 w-[3.75rem] flex-col items-center justify-center rounded-2xl transition-colors {slot
												.items.length > 0
												? 'border-transparent'
												: 'border-2 border-dashed border-white/50 bg-white/10'}"
										>
											{#each slot.items as chip (chip.id)}
												<div
													animate:flip={{ duration: FLIP_MS }}
													class="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white px-1 shadow-md"
												>
													<span class="text-base font-bold leading-none text-blue-700"
														>{chip.number}</span
													>
													<span
														class="max-w-full truncate text-[9px] font-medium leading-tight text-gray-700"
														>{chip.name.split(' ')[0]}</span
													>
													<span class="text-[7px] leading-tight text-gray-400"
														>{fmt(chip.totalMs)}</span
													>
													<span class="text-[7px] font-semibold leading-tight text-green-600"
														>{fmt(chip.stintMs)}</span
													>
												</div>
											{/each}
											{#if slot.items.length === 0}
												<span class="text-[10px] font-semibold text-white/70">{pos}</span>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- Bench -->
		<div class="border-t border-gray-200 bg-white px-4 pb-4 pt-3">
			<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
				Bench ({bench.length})
			</p>
			<div
				use:dndzone={{ items: bench, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
				on:consider={handleBenchConsider}
				on:finalize={handleBenchFinalize}
				class="flex max-h-28 flex-wrap gap-2 overflow-y-auto"
			>
				{#each bench as chip (chip.id)}
					<div
						animate:flip={{ duration: FLIP_MS }}
						class="flex h-20 w-[3.75rem] flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-700 px-1 shadow-sm"
					>
						<span class="text-base font-bold leading-none text-white">{chip.number}</span>
						<span class="max-w-full truncate text-[9px] font-medium leading-tight text-blue-100"
							>{chip.name.split(' ')[0]}</span
						>
						<span class="text-[7px] leading-tight text-blue-200">{fmt(chip.totalMs)}</span>
						<span class="text-[7px] font-semibold leading-tight text-yellow-300"
							>{fmt(chip.stintMs)}</span
						>
					</div>
				{/each}
				{#if bench.length === 0}
					<p class="py-2 text-sm text-gray-400">Everyone is on the field</p>
				{/if}
			</div>
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
			<button on:click={() => goto('/matches')} class="btn-primary mt-6"> Back to Matches </button>
		</div>
	</div>
{/if}
