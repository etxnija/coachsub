<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { registerWriteHook } from '$lib/db.js';
	import { restoreAuth } from '$lib/pb.js';
	import { pushPlayer, pushMatch, pushMatchPlayers, pushMatchStats, deletePlayerPb, pushTeam } from '$lib/sync.js';

	onMount(async () => {
		// Try to restore PocketBase auth from localStorage
		await restoreAuth();

		// Register write hook: every local write triggers a best-effort PB push
		registerWriteHook((type, data) => {
			switch (type) {
				case 'player':
					pushPlayer(data).catch(console.error);
					break;
				case 'deletePlayer':
					deletePlayerPb(data).catch(console.error);
					break;
				case 'match':
					pushMatch(data).catch(console.error);
					break;
				case 'matchPlayers':
					pushMatchPlayers(data).catch(console.error);
					break;
				case 'matchStats':
					pushMatchStats(data.matchId, data.period).catch(console.error);
					break;
			}
		});
	});
</script>

<div class="mx-auto min-h-screen max-w-md bg-gray-50">
	<slot />
</div>
