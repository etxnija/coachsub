<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getPlayer, updatePlayer, deletePlayer, POSITIONS } from '$lib/db.js';
  import { goto } from '$app/navigation';

  /** @type {import('$lib/db.js').Player | null} */
  let player = null;
  let name = '';
  let number = '';
  let position = '';
  let loading = true;
  let saving = false;
  let deleting = false;
  let error = '';
  let confirmDelete = false;

  onMount(async () => {
    const id = parseInt($page.params.id, 10);
    player = await getPlayer(id) ?? null;
    if (player) {
      name = player.name;
      number = String(player.number);
      position = player.position ?? '';
    }
    loading = false;
  });

  async function handleSubmit() {
    error = '';
    const num = parseInt(number, 10);
    if (!name.trim()) { error = 'Name is required'; return; }
    if (!number || isNaN(num) || num < 1 || num > 99) { error = 'Number must be 1–99'; return; }
    if (!player?.id) return;

    saving = true;
    try {
      await updatePlayer(player.id, { name: name.trim(), number: num, position: position || null });
      goto('/');
    } catch (e) {
      error = 'Failed to save changes';
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { confirmDelete = true; return; }
    if (!player?.id) return;
    deleting = true;
    try {
      await deletePlayer(player.id);
      goto('/');
    } catch (e) {
      error = 'Failed to remove player';
      deleting = false;
      confirmDelete = false;
    }
  }
</script>

<svelte:head>
  <title>{player ? player.name : 'Player'} · CoachSub</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
  <!-- Header -->
  <header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
    <div class="flex items-center gap-3">
      <button on:click={() => goto('/')} class="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 active:bg-gray-100" aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
          <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
        </svg>
      </button>
      <h1 class="text-xl font-bold text-gray-900">Edit Player</h1>
    </div>
  </header>

  <!-- Content -->
  <main class="flex-1 px-4 py-6">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent"></div>
      </div>
    {:else if !player}
      <div class="py-20 text-center">
        <p class="text-gray-500">Player not found</p>
        <button on:click={() => goto('/')} class="mt-4 text-blue-700 underline">Back to squad</button>
      </div>
    {:else}
      <form on:submit|preventDefault={handleSubmit} class="space-y-5">
        <!-- Name -->
        <div>
          <label for="name" class="mb-1.5 block text-sm font-medium text-gray-700">Name <span class="text-red-500">*</span></label>
          <input
            id="name"
            type="text"
            bind:value={name}
            autocomplete="off"
            autocorrect="off"
            class="input-field"
            required
          />
        </div>

        <!-- Number -->
        <div>
          <label for="number" class="mb-1.5 block text-sm font-medium text-gray-700">Number <span class="text-red-500">*</span></label>
          <input
            id="number"
            type="number"
            inputmode="numeric"
            bind:value={number}
            min="1"
            max="99"
            class="input-field"
            required
          />
        </div>

        <!-- Position -->
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700">Position <span class="text-gray-400">(optional)</span></p>
          <div class="grid grid-cols-4 gap-2">
            {#each POSITIONS as pos}
              <button
                type="button"
                on:click={() => position = position === pos.value ? '' : pos.value}
                class="rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors {position === pos.value ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-200 bg-white text-gray-600'}"
              >
                {pos.label}
              </button>
            {/each}
          </div>
        </div>

        {#if error}
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        {/if}

        <div class="pt-2">
          <button type="submit" class="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      <!-- Delete -->
      <div class="mt-8 border-t border-gray-200 pt-6">
        <button
          on:click={handleDelete}
          disabled={deleting}
          class={confirmDelete ? 'btn-danger' : 'btn-secondary !text-red-600'}
        >
          {#if deleting}
            Removing…
          {:else if confirmDelete}
            Tap again to confirm delete
          {:else}
            Remove Player
          {/if}
        </button>
        {#if confirmDelete && !deleting}
          <button on:click={() => confirmDelete = false} class="mt-2 w-full py-2 text-sm text-gray-500">
            Cancel
          </button>
        {/if}
      </div>
    {/if}
  </main>
</div>
