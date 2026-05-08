<script>
	import { createMatch, getOrCreateTeam } from '$lib/db.js';
	import { goto } from '$app/navigation';

	let name = '';
	let opponent = '';
	let duration = '20';
	let periods = '2';
	let formation = '1-2-3-1';
	let saving = false;
	let error = '';

	const today = new Date().toISOString().slice(0, 10);

	async function handleSubmit() {
		error = '';
		const dur = parseInt(duration, 10);
		const per = parseInt(periods, 10);

		if (!name.trim()) {
			error = 'Match name is required';
			return;
		}
		if (!duration || isNaN(dur) || dur < 1 || dur > 90) {
			error = 'Duration must be 1–90 minutes';
			return;
		}
		if (!periods || isNaN(per) || per < 1 || per > 4) {
			error = 'Periods must be 1–4';
			return;
		}
		if (!formation.trim()) {
			error = 'Formation is required';
			return;
		}

		saving = true;
		try {
			const team = await getOrCreateTeam();
			const id = await createMatch({
				name: name.trim(),
				opponent: opponent.trim() || undefined,
				date: today,
				format: '7v7',
				duration: dur,
				periods: per,
				formation: formation.trim(),
				teamId: team.id,
				status: 'setup'
			});
			goto(`/match/${id}`);
		} catch {
			error = 'Failed to create match';
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>New Match · CoachSub</title>
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
			<h1 class="text-xl font-bold text-gray-900">New Match</h1>
		</div>
	</header>

	<!-- Form -->
	<main class="flex-1 px-4 py-6">
		<form on:submit|preventDefault={handleSubmit} class="space-y-5">
			<!-- Match name -->
			<div>
				<label for="name" class="mb-1.5 block text-sm font-medium text-gray-700"
					>Match name <span class="text-red-500">*</span></label
				>
				<input
					id="name"
					type="text"
					bind:value={name}
					placeholder="e.g. League Game 1"
					autocomplete="off"
					autocorrect="off"
					class="input-field"
					required
				/>
			</div>

			<!-- Opponent -->
			<div>
				<label for="opponent" class="mb-1.5 block text-sm font-medium text-gray-700"
					>Opponent <span class="text-gray-400">(optional)</span></label
				>
				<input
					id="opponent"
					type="text"
					bind:value={opponent}
					placeholder="Opposing team name"
					autocomplete="off"
					autocorrect="off"
					class="input-field"
				/>
			</div>

			<!-- Duration + Periods -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="duration" class="mb-1.5 block text-sm font-medium text-gray-700"
						>Minutes/period</label
					>
					<input
						id="duration"
						type="number"
						inputmode="numeric"
						bind:value={duration}
						min="1"
						max="90"
						class="input-field"
					/>
				</div>
				<div>
					<label for="periods" class="mb-1.5 block text-sm font-medium text-gray-700">Periods</label
					>
					<input
						id="periods"
						type="number"
						inputmode="numeric"
						bind:value={periods}
						min="1"
						max="4"
						class="input-field"
					/>
				</div>
			</div>

			<!-- Formation -->
			<div>
				<label for="formation" class="mb-1.5 block text-sm font-medium text-gray-700"
					>Formation</label
				>
				<input
					id="formation"
					type="text"
					bind:value={formation}
					placeholder="e.g. 1-2-3-1"
					autocomplete="off"
					class="input-field"
				/>
				<p class="mt-1.5 text-xs text-gray-500">
					7v7 format hardcoded. Formation segments: GK-DEF-MID-FWD.
				</p>
			</div>

			{#if error}
				<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
			{/if}

			<div class="pt-2">
				<button type="submit" class="btn-primary" disabled={saving}>
					{saving ? 'Creating…' : 'Create Match'}
				</button>
			</div>
		</form>
	</main>
</div>
