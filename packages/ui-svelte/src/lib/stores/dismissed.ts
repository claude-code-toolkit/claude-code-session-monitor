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
			update((dismissed: Set<string>) => {
				dismissed.add(sessionId);
				if (browser) {
					localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
				}
				return new Set(dismissed);
			});
		},
		restore: (sessionId: string) => {
			update((dismissed: Set<string>) => {
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

// Max age filter (in hours) - sessions older than this are hidden
const MAX_AGE_STORAGE_KEY = 'claude-sessions-max-age-hours';
const DEFAULT_MAX_AGE_HOURS = 24; // Default: hide sessions older than 24 hours

function createMaxAgeStore() {
	const initial = browser
		? parseInt(localStorage.getItem(MAX_AGE_STORAGE_KEY) || String(DEFAULT_MAX_AGE_HOURS), 10)
		: DEFAULT_MAX_AGE_HOURS;

	const { subscribe, set } = writable<number>(initial);

	return {
		subscribe,
		setMaxAge: (hours: number) => {
			set(hours);
			if (browser) {
				localStorage.setItem(MAX_AGE_STORAGE_KEY, String(hours));
			}
		},
	};
}

export const maxAgeHours = createMaxAgeStore();

export function isSessionTooOld(lastActivityAt: string, maxHours: number): boolean {
	const ageMs = Date.now() - new Date(lastActivityAt).getTime();
	const ageHours = ageMs / (1000 * 60 * 60);
	return ageHours > maxHours;
}

// Collapsed sections store
const COLLAPSED_STORAGE_KEY = 'claude-sessions-collapsed-sections';

function createCollapsedStore() {
	const initial: Set<string> = new Set(
		browser ? JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]') : []
	);

	const { subscribe, update } = writable<Set<string>>(initial);

	return {
		subscribe,
		toggle: (repoId: string) => {
			update((collapsed: Set<string>) => {
				if (collapsed.has(repoId)) {
					collapsed.delete(repoId);
				} else {
					collapsed.add(repoId);
				}
				if (browser) {
					localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]));
				}
				return new Set(collapsed);
			});
		},
		isCollapsed: (repoId: string, collapsed: Set<string>) => {
			return collapsed.has(repoId);
		},
	};
}

export const collapsedSections = createCollapsedStore();
