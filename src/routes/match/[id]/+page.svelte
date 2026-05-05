<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getMatch, getPlayers, getMatchPlayers, saveMatchPlayers } from '$lib/db.js';
	import { parseFormation, slotId } from '$lib/formation.js';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	/** @type {import('$lib/db.js').Match | null} */
	let match = null;
	/** @type {import('$lib/db.js').Player[]} */
	let allPlayers = [];
	let loading = true;

	// Tab state: 'roster' | 'formation'
	let tab = 'roster';

	// --- Roster tab state ---
	/** Set of player IDs included in this match */
	let included = new Set();

	// --- Formation tab state ---
	/**
	 * Each pitch slot: { id: string, position: string, items: PlayerChip[] }
	 * PlayerChip: { id: number, name: string, number: number, position: string }
	 */
	/** @type {{ id: string, position: string, type: string, items: {id: number, name: string, number: number}[] }[]} */
	let slots = [];
	/** @type {{ id: number, name: string, number: number }[]} */
	let bench = [];
	/** @type {{ type: string, positions: string[] }[]} */
	let formationRows = [];

	const FLIP_MS = 200;

	onMount(async () => {
		const id = parseInt($page.params.id ?? '', 10);
		const [fetchedMatch, players] = await Promise.all([getMatch(id), getPlayers()]);
		match = fetchedMatch ?? null;
		allPlayers = players;

		if (!match) {
			loading = false;
			return;
		}

		const existing = await getMatchPlayers(id);

		if (existing.length === 0) {
			// Default: all players included, none starting
			included = new Set(allPlayers.filter((p) => p.id !== undefined).map((p) => p.id));
		} else {
			included = new Set(existing.map((mp) => mp.playerId));
		}

		buildFormationState(existing);
		loading = false;
	});

	/**
	 * Build slots and bench from saved matchPlayers (or empty).
	 * @param {import('$lib/db.js').MatchPlayer[]} existing
	 */
	function buildFormationState(existing) {
		if (!match) return;

		formationRows = parseFormation(match.formation);

		// Build slot list (one per position label, per row)
		slots = formationRows.flatMap((row) =>
			row.positions.map((pos) => ({
				id: slotId(row.type, pos),
				position: pos,
				type: row.type,
				items: []
			}))
		);

		// Place starting players into their slots
		for (const mp of existing) {
			if (mp.starting && mp.matchPosition) {
				const slot = slots.find((s) => s.position === mp.matchPosition);
				const player = allPlayers.find((p) => p.id === mp.playerId);
				if (slot && player && player.id !== undefined) {
					slot.items = [{ id: player.id, name: player.name, number: player.number }];
				}
			}
		}

		// Bench = included players not in any slot
		const startingIds = new Set(slots.flatMap((s) => s.items.map((i) => i.id)));
		bench = allPlayers
			.filter((p) => p.id !== undefined && included.has(p.id) && !startingIds.has(p.id))
			.map((p) => ({ id: /** @type {number} */ (p.id), name: p.name, number: p.number }));
	}

	// --- Roster toggle ---
	/** @param {number} playerId */
	function togglePlayer(playerId) {
		const next = new Set(included);
		if (next.has(playerId)) {
			next.delete(playerId);
			// Remove from bench/slots if present
			bench = bench.filter((p) => p.id !== playerId);
			for (const slot of slots) {
				slot.items = slot.items.filter((p) => p.id !== playerId);
			}
			slots = slots;
		} else {
			next.add(playerId);
			bench = [
				...bench,
				{
					id: playerId,
					name: allPlayers.find((p) => p.id === playerId)?.name ?? '',
					number: allPlayers.find((p) => p.id === playerId)?.number ?? 0
				}
			];
		}
		included = next;
		persistRoster();
	}

	// --- Persist ---
	async function persistRoster() {
		if (!match?.id) return;
		const startingByPosition = new Map(
			slots.filter((s) => s.items.length > 0).map((s) => [s.items[0].id, s.position])
		);
		const players = allPlayers
			.filter((p) => p.id !== undefined && included.has(p.id))
			.map((p) => ({
				matchId: /** @type {number} */ (match?.id),
				playerId: /** @type {number} */ (p.id),
				starting: startingByPosition.has(/** @type {number} */ (p.id)),
				matchPosition: /** @type {import('$lib/db.js').MatchPosition} */ (
					startingByPosition.get(/** @type {number} */ (p.id)) ?? null
				)
			}));
		await saveMatchPlayers(/** @type {number} */ (match.id), players);
	}

	// --- DnD handlers ---
	/** @param {string} slotId @param {CustomEvent} e */
	function handleSlotConsider(slotId, e) {
		const target = slots.find((s) => s.id === slotId);
		if (target) {
			target.items = e.detail.items;
			slots = slots;
		}
	}

	/** @param {string} slotId @param {CustomEvent} e */
	function handleSlotFinalize(slotId, e) {
		const target = slots.find((s) => s.id === slotId);
		if (!target) return;

		const incomingPlayer = e.detail.items[0];
		const displaced = target.items.find((p) => p.id !== incomingPlayer?.id);

		// If something was displaced and came from another slot, send it to bench
		if (displaced) {
			const alreadyOnBench = bench.some((p) => p.id === displaced.id);
			const alreadyInSlot = slots.some(
				(s) => s.id !== slotId && s.items.some((p) => p.id === displaced.id)
			);
			if (!alreadyOnBench && !alreadyInSlot) {
				bench = [...bench, displaced];
			}
		}

		target.items = e.detail.items.slice(0, 1);
		slots = slots;
		// Remove the placed player from bench if they came from there
		if (incomingPlayer) {
			bench = bench.filter((p) => p.id !== incomingPlayer.id);
		}
		persistRoster();
	}

	/** @param {any} e */
	function handleBenchConsider(e) {
		bench = e.detail.items;
	}

	/** @param {any} e */
	function handleBenchFinalize(e) {
		bench = e.detail.items;
		// Remove from slots if dropped back to bench
		const benchIds = new Set(bench.map((p) => p.id));
		for (const slot of slots) {
			const before = slot.items.length;
			slot.items = slot.items.filter((p) => !benchIds.has(p.id));
			if (slot.items.length !== before) slots = slots;
		}
		slots = slots;
		persistRoster();
	}

	$: startingCount = slots.filter((s) => s.items.length > 0).length;
</script>

<svelte:head>
	<title>{match ? match.name : 'Match'} · CoachSub</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Header -->
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
		<div class="flex items-center gap-3">
			<button
				on:click={() => goto('/matches')}
				class="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
				aria-label="Back"
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
				<h1 class="truncate text-xl font-bold text-gray-900">{match?.name ?? '…'}</h1>
				{#if match?.opponent}
					<p class="text-sm text-gray-500">vs {match.opponent}</p>
				{/if}
			</div>
		</div>

		<!-- Tabs -->
		{#if match}
			<div class="mt-3 flex rounded-xl bg-gray-100 p-1">
				<button
					on:click={() => (tab = 'roster')}
					class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors {tab === 'roster'
						? 'bg-white text-gray-900 shadow-sm'
						: 'text-gray-500'}"
				>
					Roster ({included.size})
				</button>
				<button
					on:click={() => (tab = 'formation')}
					class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors {tab === 'formation'
						? 'bg-white text-gray-900 shadow-sm'
						: 'text-gray-500'}"
				>
					Formation ({startingCount}/{slots.length})
				</button>
			</div>
		{/if}
	</header>

	<!-- Content -->
	<main class="flex-1">
		{#if loading}
			<div class="flex items-center justify-center py-20">
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"
				></div>
			</div>
		{:else if !match}
			<div class="py-20 text-center">
				<p class="text-gray-500">Match not found</p>
				<button on:click={() => goto('/matches')} class="mt-4 text-blue-700 underline"
					>Back to matches</button
				>
			</div>

			<!-- ROSTER TAB -->
		{:else if tab === 'roster'}
			<div class="px-4 py-4">
				<p class="mb-3 text-sm text-gray-500">
					Toggle players in or out of this match. All players are included by default.
				</p>
				{#if allPlayers.length === 0}
					<div class="py-12 text-center text-gray-400">No players in squad yet.</div>
				{:else}
					<ul class="space-y-2">
						{#each allPlayers as player (player.id)}
							<li>
								<button
									on:click={() => player.id !== undefined && togglePlayer(player.id)}
									class="flex w-full items-center gap-4 rounded-2xl px-4 py-3 transition-colors {included.has(
										player.id
									)
										? 'bg-white shadow-sm'
										: 'bg-gray-50 opacity-50'}"
								>
									<div
										class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white {included.has(
											player.id
										)
											? 'bg-blue-700'
											: 'bg-gray-400'}"
									>
										{player.number}
									</div>
									<div class="min-w-0 flex-1 text-left">
										<p class="truncate text-base font-semibold text-gray-900">{player.name}</p>
									</div>
									<!-- Toggle check -->
									<div
										class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full {included.has(
											player.id
										)
											? 'bg-blue-700'
											: 'border-2 border-gray-300 bg-white'}"
									>
										{#if included.has(player.id)}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 20 20"
												fill="currentColor"
												class="h-4 w-4 text-white"
											>
												<path
													fill-rule="evenodd"
													d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
													clip-rule="evenodd"
												/>
											</svg>
										{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
					<p class="mt-4 text-center text-sm text-gray-400">
						{included.size} of {allPlayers.length} players selected
					</p>
				{/if}
			</div>

			<!-- FORMATION TAB -->
		{:else}
			<div class="flex flex-col" style="min-height: calc(100vh - 140px)">
				<!-- Pitch -->
				<div
					class="relative mx-4 mt-4 overflow-hidden rounded-2xl bg-green-700"
					style="aspect-ratio: 9/13"
				>
					<!-- Pitch markings -->
					<svg
						class="absolute inset-0 h-full w-full"
						viewBox="0 0 90 130"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<!-- Outline -->
						<rect
							x="2"
							y="2"
							width="86"
							height="126"
							rx="2"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1.5"
						/>
						<!-- Center line -->
						<line x1="2" y1="65" x2="88" y2="65" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
						<!-- Center circle -->
						<circle cx="45" cy="65" r="12" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
						<!-- Top penalty area -->
						<rect
							x="20"
							y="2"
							width="50"
							height="20"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1"
						/>
						<!-- Bottom penalty area -->
						<rect
							x="20"
							y="108"
							width="50"
							height="20"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1"
						/>
						<!-- Top goal -->
						<rect
							x="33"
							y="0"
							width="24"
							height="4"
							stroke="rgba(255,255,255,0.3)"
							stroke-width="1"
						/>
						<!-- Bottom goal -->
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
					<div class="absolute inset-0 flex flex-col justify-around py-4">
						{#each formationRows as row}
							<div class="flex justify-around px-2">
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
											class="relative flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 transition-colors {slot
												.items.length > 0
												? 'border-transparent'
												: 'border-white/50 border-dashed bg-white/10'}"
										>
											{#each slot.items as chip (chip.id)}
												<div
													animate:flip={{ duration: FLIP_MS }}
													class="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-white shadow-md"
												>
													<span class="text-sm font-bold text-blue-700">{chip.number}</span>
													<span
														class="max-w-full truncate px-1 text-[9px] font-medium leading-tight text-gray-700"
														>{chip.name.split(' ')[0]}</span
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

				<!-- Bench strip -->
				<div class="mt-3 px-4 pb-4">
					<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
						Bench ({bench.length})
					</p>
					<div
						use:dndzone={{ items: bench, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
						on:consider={handleBenchConsider}
						on:finalize={handleBenchFinalize}
						class="flex min-h-[4rem] flex-wrap gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-3"
					>
						{#each bench as chip (chip.id)}
							<div
								animate:flip={{ duration: FLIP_MS }}
								class="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-blue-700 shadow-sm"
							>
								<span class="text-sm font-bold text-white">{chip.number}</span>
								<span
									class="max-w-full truncate px-1 text-[9px] font-medium leading-tight text-blue-100"
									>{chip.name.split(' ')[0]}</span
								>
							</div>
						{/each}
						{#if bench.length === 0}
							<p class="w-full text-center text-sm text-gray-400">All players assigned</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>
