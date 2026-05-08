<script>
	import { onMount } from 'svelte';
	import { getMatches } from '$lib/db.js';
	import { goto } from '$app/navigation';

	/** @type {import('$lib/db.js').Match[]} */
	let matches = [];
	let loading = true;

	onMount(async () => {
		matches = await getMatches();
		loading = false;
	});

	/** @param {string} date */
	function formatDate(date) {
		return new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	/** @param {import('$lib/db.js').Match} match */
	function matchHref(match) {
		if (match.status === 'complete') return `/match/${match.id}/stats`;
		if (match.status === 'live') return `/match/${match.id}/game`;
		return `/match/${match.id}`;
	}
</script>

<svelte:head>
	<title>Matches · CoachSub</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Header -->
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<button
					on:click={() => goto('/')}
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
				<h1 class="text-xl font-bold text-gray-900">Matches</h1>
			</div>
			<button
				on:click={() => goto('/match/new')}
				class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white shadow-sm active:bg-blue-800"
				aria-label="New match"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="h-5 w-5"
				>
					<path
						d="M12 4.5a.75.75 0 01.75.75v6h6a.75.75 0 010 1.5h-6v6a.75.75 0 01-1.5 0v-6h-6a.75.75 0 010-1.5h6v-6A.75.75 0 0112 4.5z"
					/>
				</svg>
			</button>
		</div>
	</header>

	<!-- Content -->
	<main class="flex-1 px-4 py-4">
		{#if loading}
			<div class="flex items-center justify-center py-20">
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"
				></div>
			</div>
		{:else if matches.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="h-8 w-8 text-blue-700"
					>
						<path
							fill-rule="evenodd"
							d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z"
							clip-rule="evenodd"
						/>
						<path
							d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z"
						/>
					</svg>
				</div>
				<h2 class="mb-1 text-lg font-semibold text-gray-900">No matches yet</h2>
				<p class="mb-6 text-sm text-gray-500">Create your first match to set up a lineup</p>
				<button on:click={() => goto('/match/new')} class="btn-primary max-w-xs">
					New Match
				</button>
			</div>
		{:else}
			<ul class="space-y-2">
				{#each matches as match (match.id)}
					<li>
						<button
							on:click={() => goto(matchHref(match))}
							class="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm active:bg-gray-50"
						>
							<div class="min-w-0 flex-1 text-left">
								<p class="truncate text-base font-semibold text-gray-900">{match.name}</p>
								<p class="text-sm text-gray-500">
									{#if match.opponent}vs {match.opponent} · {/if}{formatDate(match.date)}
								</p>
							</div>
							<!-- Status badge -->
							{#if match.status === 'live'}
								<span class="flex flex-shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
									<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"></span>Live
								</span>
							{:else if match.status === 'complete'}
								<span class="flex-shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">Done</span>
							{:else}
								<span class="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Setup</span>
							{/if}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 flex-shrink-0 text-gray-400">
								<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
							</svg>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>
