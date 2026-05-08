import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';

/** @type {PocketBase | null} */
let _pb = null;

/** @returns {PocketBase | null} */
export function getPb() {
	return _pb;
}

/**
 * @typedef {{ connected: boolean, syncing: boolean, lastSync: Date | null, error: string | null }} SyncState
 */
export const syncState = writable(/** @type {SyncState} */ ({
	connected: false,
	syncing: false,
	lastSync: null,
	error: null
}));

const STORAGE_KEY = 'coachsub_pb_auth';

/** @returns {{ url: string, email: string, token: string, model: any } | null} */
function loadStored() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

/** @param {{ url: string, email: string, token: string, model: any }} data */
function saveStored(data) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearAuth() {
	localStorage.removeItem(STORAGE_KEY);
	_pb?.authStore.clear();
	_pb = null;
	syncState.set({ connected: false, syncing: false, lastSync: null, error: null });
}

/**
 * Restore auth from localStorage. Call on app start.
 * @returns {Promise<boolean>}
 */
export async function restoreAuth() {
	const stored = loadStored();
	if (!stored) return false;
	try {
		const pb = new PocketBase(stored.url);
		pb.authStore.save(stored.token, stored.model);
		if (!pb.authStore.isValid) { clearAuth(); return false; }
		// Refresh token
		await pb.collection('users').authRefresh();
		_pb = pb;
		saveStored({ ...stored, token: pb.authStore.token });
		syncState.update((s) => ({ ...s, connected: true }));
		return true;
	} catch {
		clearAuth();
		return false;
	}
}

/**
 * Connect with email/password.
 * @param {string} url
 * @param {string} email
 * @param {string} password
 */
export async function connectPb(url, email, password) {
	const cleanUrl = url.replace(/\/$/, '');
	const pb = new PocketBase(cleanUrl);
	const auth = await pb.collection('users').authWithPassword(email, password);
	_pb = pb;
	saveStored({ url: cleanUrl, email, token: pb.authStore.token, model: pb.authStore.model });
	syncState.update((s) => ({ ...s, connected: true, error: null }));
	return auth;
}

/** @returns {string | null} */
export function getStoredUrl() {
	return loadStored()?.url ?? null;
}

/** @returns {string | null} */
export function getStoredEmail() {
	return loadStored()?.email ?? null;
}
