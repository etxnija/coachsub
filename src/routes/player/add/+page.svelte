<script>
	import { addPlayer, getOrCreateTeam, POSITIONS } from '$lib/db.js';
	import { goto } from '$app/navigation';

	let name = '';
	let number = '';
	let position = '';
	let saving = false;
	let error = '';

	/** @type {HTMLInputElement} */
	let nameInput;

	/** @param {boolean} andAnother */
	async function save(andAnother) {
		error = '';
		const num = parseInt(number, 10);
		if (!name.trim()) { error = 'Name is required'; return; }
		if (!number || isNaN(num) || num < 1 || num > 99) { error = 'Number must be 1–99'; return; }

		saving = true;
		try {
			const team = await getOrCreateTeam();
			await addPlayer({ name: name.trim(), number: num, position: position || null, teamId: team.id });
			if (andAnother) {
				name = '';
				number = '';
				position = '';
				saving = false;
				nameInput?.focus();
			} else {
				goto('/');
			}
		} catch {
			error = 'Failed to save player';
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Add Player · CoachSub</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Header -->
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
		<div class="flex items-center gap-3">
			<button
				on:click={() => goto('/')}
				class="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
				aria-label="Back"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
					<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
				</svg>
			</button>
			<h1 class="text-xl font-bold text-gray-900">Add Player</h1>
		</div>
	</header>

	<!-- Form -->
	<main class="flex-1 px-4 py-6">
		<form on:submit|preventDefault={() => save(false)} class="space-y-5">
			<!-- Name -->
			<div>
				<label for="name" class="mb-1.5 block text-sm font-medium text-gray-700">Name <span class="text-red-500">*</span></label>
				<input
					id="name"
					bind:this={nameInput}
					type="text"
					bind:value={name}
					placeholder="Player name"
					autocomplete="off"
					autocorrect="off"
					class="input-field"
					autofocus
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
					placeholder="1–99"
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
							on:click={() => (position = position === pos.value ? '' : pos.value)}
							class="rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors {position === pos.value ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-200 bg-white text-gray-600'}"
						>{pos.label}</button>
					{/each}
				</div>
			</div>

			{#if error}
				<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
			{/if}

			<div class="flex gap-3 pt-2">
				<button
					type="button"
					on:click={() => save(true)}
					disabled={saving}
					class="flex-1 rounded-2xl border-2 border-blue-700 py-3 text-sm font-semibold text-blue-700 active:bg-blue-50 disabled:opacity-50"
				>
					{saving ? 'Saving…' : '+ Add Another'}
				</button>
				<button type="submit" disabled={saving} class="btn-primary flex-1">
					{saving ? 'Saving…' : 'Done'}
				</button>
			</div>
		</form>
	</main>
</div>
