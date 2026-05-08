<script>
	import { goto } from '$app/navigation';
	import { connectPb, clearAuth, syncState, getStoredUrl, getStoredEmail } from '$lib/pb.js';
	import { syncAll } from '$lib/sync.js';

	let url = getStoredUrl() ?? '';
	let email = getStoredEmail() ?? '';
	let password = '';
	let connecting = false;
	let error = '';

	$: connected = $syncState.connected;
	$: syncing = $syncState.syncing;
	$: lastSync = $syncState.lastSync;
	$: syncError = $syncState.error;

	/** @param {Date | null} d */
	function fmtTime(d) {
		if (!d) return 'Never';
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	async function connect() {
		if (!url || !email || !password) { error = 'All fields are required'; return; }
		error = '';
		connecting = true;
		try {
			await connectPb(url, email, password);
			password = '';
			// Full sync after connecting
			await syncAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Connection failed';
		} finally {
			connecting = false;
		}
	}

	function disconnect() {
		clearAuth();
		url = '';
		email = '';
	}
</script>

<svelte:head>
	<title>Settings · CoachSub</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
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
			<h1 class="text-xl font-bold text-gray-900">Sync Settings</h1>
		</div>
	</header>

	<main class="flex-1 px-4 py-6 space-y-6">
		{#if connected}
			<!-- Connected state -->
			<div class="rounded-2xl bg-white px-4 py-4 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
						<div class="h-3 w-3 rounded-full bg-green-500"></div>
					</div>
					<div class="min-w-0 flex-1">
						<p class="font-semibold text-gray-900">Connected</p>
						<p class="truncate text-sm text-gray-500">{email}</p>
					</div>
				</div>
				{#if syncError}
					<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{syncError}</p>
				{/if}
				<div class="mt-4 flex gap-3">
					<button
						on:click={() => syncAll().catch(console.error)}
						disabled={syncing}
						class="flex-1 rounded-xl bg-blue-700 py-3 text-sm font-semibold text-white active:bg-blue-800 disabled:opacity-50"
					>
						{syncing ? 'Syncing…' : 'Sync Now'}
					</button>
					<button
						on:click={disconnect}
						class="rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 active:bg-gray-50"
					>Disconnect</button>
				</div>
				<p class="mt-3 text-center text-xs text-gray-400">Last sync: {fmtTime(lastSync)}</p>
			</div>

			<!-- What syncs -->
			<div class="rounded-2xl bg-white px-4 py-4 shadow-sm">
				<p class="mb-3 text-sm font-semibold text-gray-700">What gets synced</p>
				<ul class="space-y-1.5 text-sm text-gray-600">
					<li class="flex items-center gap-2"><span class="text-green-500">✓</span> Players &amp; squad</li>
					<li class="flex items-center gap-2"><span class="text-green-500">✓</span> Matches &amp; formations</li>
					<li class="flex items-center gap-2"><span class="text-green-500">✓</span> Lineup &amp; rotation groups</li>
					<li class="flex items-center gap-2"><span class="text-green-500">✓</span> Match stats</li>
				</ul>
			</div>
		{:else}
			<!-- Connect form -->
			<div class="rounded-2xl bg-white px-4 py-4 shadow-sm">
				<p class="mb-4 text-sm text-gray-500">
					Connect to a PocketBase instance to share your team with other coaches.
				</p>
				<div class="space-y-4">
					<div>
						<label for="pb-url" class="mb-1.5 block text-sm font-medium text-gray-700">Server URL</label>
						<input
							id="pb-url"
							type="url"
							bind:value={url}
							placeholder="https://yourapp.pockethost.io"
							class="input-field"
							autocomplete="off"
							autocapitalize="off"
						/>
					</div>
					<div>
						<label for="pb-email" class="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
						<input
							id="pb-email"
							type="email"
							bind:value={email}
							placeholder="team@example.com"
							class="input-field"
							autocomplete="email"
						/>
					</div>
					<div>
						<label for="pb-pass" class="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
						<input
							id="pb-pass"
							type="password"
							bind:value={password}
							placeholder="••••••••"
							class="input-field"
							autocomplete="current-password"
						/>
					</div>
					{#if error}
						<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
					{/if}
					<button
						on:click={connect}
						disabled={connecting}
						class="btn-primary"
					>
						{connecting ? 'Connecting…' : 'Connect & Sync'}
					</button>
				</div>
			</div>

			<!-- Setup hint -->
			<div class="rounded-2xl bg-blue-50 px-4 py-4">
				<p class="text-sm font-semibold text-blue-800">Don't have a server yet?</p>
				<p class="mt-1 text-sm text-blue-700">
					Create a free account at pockethost.io, then run the setup script to create the required collections.
				</p>
				<p class="mt-2 font-mono text-xs text-blue-600">node scripts/setup-pb.js &lt;url&gt; &lt;email&gt; &lt;pw&gt;</p>
			</div>
		{/if}
	</main>
</div>
