#!/usr/bin/env node
/**
 * One-time PocketBase collection setup for CoachSub.
 * Usage: node scripts/setup-pb.js <url> <admin-email> <admin-password>
 *
 * Example: node scripts/setup-pb.js https://myapp.pockethost.io admin@example.com mypassword
 *
 * This script creates all required collections and sets up access rules.
 * Safe to re-run — skips collections that already exist.
 */

const [pbUrl, email, password] = process.argv.slice(2);

if (!pbUrl || !email || !password) {
	console.error('Usage: node scripts/setup-pb.js <url> <admin-email> <admin-password>');
	process.exit(1);
}

const base = pbUrl.replace(/\/$/, '');

async function req(path, method = 'GET', body = null, token = null) {
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers['Authorization'] = `Admin ${token}`;
	const res = await fetch(`${base}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) {
		// 400 with "already exists" is fine
		if (json?.message?.includes('already exists') || json?.code === 400) return json;
		throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
	}
	return json;
}

// Auth rules: any authenticated user can read/write (single-team model)
const anyAuth = '@request.auth.id != ""';
const rules = {
	listRule: anyAuth,
	viewRule: anyAuth,
	createRule: anyAuth,
	updateRule: anyAuth,
	deleteRule: anyAuth
};

async function main() {
	// 1. Authenticate as admin
	const auth = await req('/api/admins/auth-with-password', 'POST', { identity: email, password });
	const token = auth.token;
	if (!token) throw new Error('Auth failed — check email and password');
	console.log('✓ Authenticated as admin');

	// 2. Get existing collections
	const existing = await req('/api/collections?perPage=200', 'GET', null, token);
	const existingNames = new Set((existing.items ?? []).map((c) => c.name));

	async function createCollection(schema) {
		if (existingNames.has(schema.name)) {
			console.log(`  skip: ${schema.name} already exists`);
			return existing.items.find((c) => c.name === schema.name);
		}
		const result = await req('/api/collections', 'POST', schema, token);
		console.log(`  ✓ created: ${schema.name}`);
		return result;
	}

	// 3. Create collections in dependency order

	// teams (no relations)
	const teams = await createCollection({
		name: 'teams',
		type: 'base',
		...rules,
		fields: [
			{ name: 'name', type: 'text', required: true }
		]
	});

	// players (→ teams)
	const players = await createCollection({
		name: 'players',
		type: 'base',
		...rules,
		fields: [
			{ name: 'name', type: 'text', required: true },
			{ name: 'number', type: 'number', required: true },
			{ name: 'position', type: 'text' },
			{
				name: 'team',
				type: 'relation',
				required: true,
				options: { collectionId: teams.id, maxSelect: 1, cascadeDelete: false }
			}
		]
	});

	// matches (→ teams)
	const matches = await createCollection({
		name: 'matches',
		type: 'base',
		...rules,
		fields: [
			{ name: 'name', type: 'text', required: true },
			{ name: 'opponent', type: 'text' },
			{ name: 'date', type: 'text', required: true },
			{ name: 'format', type: 'text', required: true },
			{ name: 'duration', type: 'number', required: true },
			{ name: 'periods', type: 'number', required: true },
			{ name: 'formation', type: 'text', required: true },
			{ name: 'status', type: 'text' },
			{ name: 'useGroups', type: 'bool' },
			{ name: 'groupASlots', type: 'json' },
			{
				name: 'team',
				type: 'relation',
				required: true,
				options: { collectionId: teams.id, maxSelect: 1, cascadeDelete: false }
			}
		]
	});

	// match_players (→ matches, → players)
	await createCollection({
		name: 'match_players',
		type: 'base',
		...rules,
		fields: [
			{
				name: 'match',
				type: 'relation',
				required: true,
				options: { collectionId: matches.id, maxSelect: 1, cascadeDelete: true }
			},
			{
				name: 'player',
				type: 'relation',
				required: true,
				options: { collectionId: players.id, maxSelect: 1, cascadeDelete: false }
			},
			{ name: 'starting', type: 'bool', required: true },
			{ name: 'matchPosition', type: 'text' },
			{ name: 'rotationGroup', type: 'text' }
		]
	});

	// match_stats (→ matches)
	await createCollection({
		name: 'match_stats',
		type: 'base',
		...rules,
		fields: [
			{
				name: 'match',
				type: 'relation',
				required: true,
				options: { collectionId: matches.id, maxSelect: 1, cascadeDelete: true }
			},
			{ name: 'period', type: 'number', required: true },
			{ name: 'totalMsPlayed', type: 'json', required: true },
			{ name: 'msPerPosition', type: 'json', required: true }
		]
	});

	// sub_events (→ matches, → players)
	await createCollection({
		name: 'sub_events',
		type: 'base',
		...rules,
		fields: [
			{
				name: 'match',
				type: 'relation',
				required: true,
				options: { collectionId: matches.id, maxSelect: 1, cascadeDelete: true }
			},
			{
				name: 'playerIn',
				type: 'relation',
				required: true,
				options: { collectionId: players.id, maxSelect: 1, cascadeDelete: false }
			},
			{
				name: 'playerOut',
				type: 'relation',
				required: true,
				options: { collectionId: players.id, maxSelect: 1, cascadeDelete: false }
			},
			{ name: 'period', type: 'number', required: true },
			{ name: 'clockMs', type: 'number', required: true },
			{ name: 'position', type: 'text' }
		]
	});

	console.log('\n✓ Setup complete. Collections ready in PocketBase.');
	console.log('\nNext: create a user account at your PocketBase admin UI,');
	console.log('then open the app → Settings → Connect.\n');
}

main().catch((err) => {
	console.error('\n✗ Setup failed:', err.message);
	process.exit(1);
});
