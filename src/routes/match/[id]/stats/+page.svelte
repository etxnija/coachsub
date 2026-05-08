<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getMatch, getPlayers, getMatchStats } from '$lib/db.js';

	/** @type {import('$lib/db.js').Match | null} */
	let match = null;
	let loading = true;
	let hasStats = false;

	/**
	 * @typedef {{ id: number, name: string, number: number, totalMs: number, msPerPosition: Record<string, number> }} PlayerStat
	 */
	/** @type {PlayerStat[]} */
	let playerStats = [];

	/** Total field time across all players (sum of all on-field ms) */
	let matchDurationMs = 0;

	/** @param {number} ms */
	function fmt(ms) {
		if (ms <= 0) return '0:00';
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return `${m}:${String(s % 60).padStart(2, '0')}`;
	}

	/** @param {string} pos @returns {number} */
	function posOrder(pos) {
		if (pos === 'GK') return 0;
		if (/B$|^D\d/.test(pos)) return 1;
		if (/M/.test(pos)) return 2;
		return 3;
	}

	/** @param {string} pos @returns {string} */
	function posColor(pos) {
		if (pos === 'GK') return 'bg-purple-100 text-purple-700';
		if (/B$|^D\d/.test(pos)) return 'bg-blue-100 text-blue-700';
		if (/M/.test(pos)) return 'bg-green-100 text-green-700';
		return 'bg-orange-100 text-orange-700';
	}

	/** @type {string | null} */
	let error = null;

	onMount(async () => {
		try {
			const id = parseInt($page.params.id ?? '', 10);
			const [fetchedMatch, players, allStats] = await Promise.all([
				getMatch(id),
				getPlayers(),
				getMatchStats(id)
			]);
			match = fetchedMatch ?? null;

			if (!match) { loading = false; return; }

			if (allStats.length === 0) { loading = false; return; }

			hasStats = true;

			// Last period snapshot has cumulative totals for the full match
			const snapshot = allStats.sort((a, b) => b.period - a.period)[0];
			const { totalMsPlayed, msPerPosition } = snapshot;

			// Derive players from snapshot keys — robust even if matchPlayers is empty
			playerStats = Object.keys(totalMsPlayed)
				.map((key) => {
					const pid = Number(key);
					const player = players.find((p) => p.id === pid);
					if (!player) return null;
					return {
						id: pid,
						name: player.name,
						number: player.number,
						totalMs: totalMsPlayed[key] ?? 0,
						msPerPosition: msPerPosition[key] ?? {}
					};
				})
				.filter(/** @param {any} x */ (x) => x !== null)
				.sort((a, b) => b.totalMs - a.totalMs);

			matchDurationMs = (match.duration ?? 20) * (match.periods ?? 2) * 60 * 1000;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>{match?.name ?? 'Stats'} · CoachSub</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-gray-50">
	<!-- Header -->
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
		<div class="flex items-center gap-3">
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
				<h1 class="truncate text-base font-bold text-gray-900">{match?.name ?? '…'}</h1>
				{#if match?.opponent}
					<p class="text-xs text-gray-500">vs {match.opponent}</p>
				{/if}
			</div>
			<span class="flex-shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
				Stats
			</span>
		</div>
	</header>

	<main class="flex-1 px-4 py-4">
		{#if loading}
			<div class="flex items-center justify-center py-20">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"></div>
			</div>
		{:else if error}
			<div class="rounded-2xl bg-red-50 px-4 py-6 text-center">
				<p class="font-semibold text-red-700">Failed to load stats</p>
				<p class="mt-1 text-sm text-red-500">{error}</p>
			</div>
		{:else if !match}
			<div class="py-20 text-center text-gray-500">Match not found</div>
		{:else if !hasStats}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<p class="text-lg font-semibold text-gray-700">No match data yet</p>
				<p class="mt-1 text-sm text-gray-500">Stats are recorded when a match period ends.</p>
				<button
					on:click={() => goto(`/match/${match?.id}/game`)}
					class="btn-primary mt-6 max-w-xs"
				>Start Match</button>
			</div>
		{:else}
			<!-- Summary bar -->
			<div class="mb-4 flex gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
				<div class="flex-1 text-center">
					<p class="text-2xl font-bold text-gray-900">{playerStats.length}</p>
					<p class="text-xs text-gray-500">Players</p>
				</div>
				<div class="w-px bg-gray-100"></div>
				<div class="flex-1 text-center">
					<p class="text-2xl font-bold text-gray-900">{match.periods}</p>
					<p class="text-xs text-gray-500">Periods</p>
				</div>
				<div class="w-px bg-gray-100"></div>
				<div class="flex-1 text-center">
					<p class="text-2xl font-bold text-gray-900">{match.duration}'</p>
					<p class="text-xs text-gray-500">Per period</p>
				</div>
			</div>

			<!-- Player list -->
			<ul class="space-y-2">
				{#each playerStats as stat (stat.id)}
					{@const played = stat.totalMs > 0}
					{@const pct = matchDurationMs > 0 ? Math.round((stat.totalMs / matchDurationMs) * 100) : 0}
					{@const positions = Object.entries(stat.msPerPosition)
						.filter(([, ms]) => ms > 0)
						.sort(([a], [b]) => posOrder(a) - posOrder(b))}
					<li class="rounded-2xl bg-white px-4 py-3 shadow-sm">
						<div class="flex items-center gap-3">
							<!-- Jersey number -->
							<div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white {played ? 'bg-blue-700' : 'bg-gray-300'}">
								{stat.number}
							</div>
							<!-- Name + positions -->
							<div class="min-w-0 flex-1">
								<p class="truncate font-semibold text-gray-900">{stat.name}</p>
								{#if positions.length > 0}
									<div class="mt-1 flex flex-wrap gap-1">
										{#each positions as [pos, ms]}
											<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {posColor(pos)}">
												{pos} {fmt(ms)}
											</span>
										{/each}
									</div>
								{:else}
									<p class="mt-0.5 text-xs text-gray-400">No playing time</p>
								{/if}
							</div>
							<!-- Total time + pct -->
							<div class="flex-shrink-0 text-right">
								<p class="font-mono text-base font-bold {played ? 'text-gray-900' : 'text-gray-400'}">{fmt(stat.totalMs)}</p>
								{#if played}
									<p class="text-[10px] text-gray-400">{pct}%</p>
								{/if}
							</div>
						</div>
						<!-- Time bar -->
						{#if matchDurationMs > 0}
							<div class="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
								<div
									class="h-full rounded-full {played ? 'bg-blue-500' : 'bg-gray-200'}"
									style="width: {pct}%"
								></div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>
