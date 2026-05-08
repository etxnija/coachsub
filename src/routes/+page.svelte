<script>
	import { onMount } from 'svelte';
	import { getOrCreateTeam, getPlayers, POSITIONS } from '$lib/db.js';
	import { goto } from '$app/navigation';
	import { syncState } from '$lib/pb.js';

	/** @type {import('$lib/db.js').Team | null} */
	let team = null;
	/** @type {import('$lib/db.js').Player[]} */
	let players = [];
	let loading = true;

	onMount(async () => {
		team = await getOrCreateTeam();
		players = await getPlayers();
		loading = false;
	});

	/** @param {string | null} pos */
	function posLabel(pos) {
		if (!pos) return '';
		return POSITIONS.find((p) => p.value === pos)?.label ?? pos;
	}

	/** @param {string | null} pos */
	function posColor(pos) {
		const map = {
			G: 'bg-yellow-100 text-yellow-800',
			D: 'bg-blue-100 text-blue-800',
			M: 'bg-green-100 text-green-800',
			F: 'bg-red-100 text-red-800'
		};
		return pos ? (map[pos] ?? '') : '';
	}
</script>

<svelte:head>
	<title>CoachSub</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Header -->
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-xl font-bold text-gray-900">{team?.name ?? 'My Team'}</h1>
				{#if !loading}
					<p class="text-sm text-gray-500">
						{players.length} player{players.length !== 1 ? 's' : ''}
					</p>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<!-- Sync / settings indicator -->
				<button
					on:click={() => goto('/settings')}
					class="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm active:bg-gray-50"
					aria-label="Sync settings"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
						<path fill-rule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
					</svg>
					<!-- Sync status dot -->
					{#if $syncState.syncing}
						<span class="absolute right-1 top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500"></span>
					{:else if $syncState.connected}
						<span class="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-green-500"></span>
					{:else if $syncState.error}
						<span class="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500"></span>
					{/if}
				</button>
				<button
					on:click={() => goto('/matches')}
					class="flex h-10 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="h-4 w-4 text-gray-500"
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
					Matches
				</button>
				<button
					on:click={() => goto('/player/add')}
					class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white shadow-sm active:bg-blue-800"
					aria-label="Add player"
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
		{:else if players.length === 0}
			<!-- Empty state -->
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="h-8 w-8 text-blue-700"
					>
						<path
							d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z"
						/>
					</svg>
				</div>
				<h2 class="mb-1 text-lg font-semibold text-gray-900">No players yet</h2>
				<p class="mb-6 text-sm text-gray-500">Add your squad to get started</p>
				<button on:click={() => goto('/player/add')} class="btn-primary max-w-xs">
					Add first player
				</button>
			</div>
		{:else}
			<!-- Player list -->
			<ul class="space-y-2">
				{#each players as player (player.id)}
					<li>
						<button
							on:click={() => goto(`/player/${player.id}`)}
							class="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-3 shadow-sm active:bg-gray-50"
						>
							<!-- Number badge -->
							<div
								class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-700 text-base font-bold text-white"
							>
								{player.number}
							</div>
							<!-- Name + position -->
							<div class="min-w-0 flex-1 text-left">
								<p class="truncate text-base font-semibold text-gray-900">{player.name}</p>
							</div>
							<!-- Position badge -->
							{#if player.position}
								<span
									class="flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold {posColor(
										player.position
									)}"
								>
									{posLabel(player.position)}
								</span>
							{/if}
							<!-- Chevron -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4 flex-shrink-0 text-gray-400"
							>
								<path
									fill-rule="evenodd"
									d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>
