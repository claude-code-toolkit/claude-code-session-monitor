import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'claude-sessions-dismissed';

function createDismissedStore() {
	// Load from localStorage
	const initial: Set<string> = new Set(
		browser ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') : []
	);

	const { subscribe, set, update } = writable<Set<string>>(initial);

	return {
		subscribe,
		dismiss: (sessionId: string) => {
			update((dismissed) => {
				dismissed.add(sessionId);
				if (browser) {
					localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
				}
				return new Set(dismissed);
			});
		},
		restore: (sessionId: string) => {
			update((dismissed) => {
				dismissed.delete(sessionId);
				if (browser) {
					localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
				}
				return new Set(dismissed);
			});
		},
		isDismissed: (sessionId: string, dismissed: Set<string>) => {
			return dismissed.has(sessionId);
		},
		clear: () => {
			set(new Set());
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
			}
		},
	};
}

export const dismissedSessions = createDismissedStore();
