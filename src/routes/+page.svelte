<script>
  import { onMount } from 'svelte';
  import { getOrCreateTeam, getPlayers, POSITIONS } from '$lib/db.js';
  import { goto } from '$app/navigation';

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
    const map = { G: 'bg-yellow-100 text-yellow-800', D: 'bg-blue-100 text-blue-800', M: 'bg-green-100 text-green-800', F: 'bg-red-100 text-red-800' };
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
          <p class="text-sm text-gray-500">{players.length} player{players.length !== 1 ? 's' : ''}</p>
        {/if}
      </div>
      <button
        on:click={() => goto('/player/add')}
        class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white shadow-sm active:bg-blue-800"
        aria-label="Add player"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
          <path d="M12 4.5a.75.75 0 01.75.75v6h6a.75.75 0 010 1.5h-6v6a.75.75 0 01-1.5 0v-6h-6a.75.75 0 010-1.5h6v-6A.75.75 0 0112 4.5z" />
        </svg>
      </button>
    </div>
  </header>

  <!-- Content -->
  <main class="flex-1 px-4 py-4">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"></div>
      </div>
    {:else if players.length === 0}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-8 w-8 text-blue-700">
            <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
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
              <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-700 text-base font-bold text-white">
                {player.number}
              </div>
              <!-- Name + position -->
              <div class="min-w-0 flex-1 text-left">
                <p class="truncate text-base font-semibold text-gray-900">{player.name}</p>
              </div>
              <!-- Position badge -->
              {#if player.position}
                <span class="flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold {posColor(player.position)}">
                  {posLabel(player.position)}
                </span>
              {/if}
              <!-- Chevron -->
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
