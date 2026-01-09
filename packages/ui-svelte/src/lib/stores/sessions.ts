import { readable, derived, writable, type Readable, type Writable } from 'svelte/store';
import { getSessionsDb, fetchMachines, type SessionsDB, type MachineInfo } from '$lib/data/sessionsDb';
import type { Session } from '$lib/data/schema';

// Activity score weights
const STATUS_WEIGHTS: Record<Session['status'], number> = {
	working: 100,
	waiting: 50,
	idle: 1
};

const PENDING_TOOL_BONUS = 30;

/**
 * Calculate activity score for a repo group
 */
function calculateRepoActivityScore(sessions: Session[]): number {
	const now = Date.now();

	return sessions.reduce((score, session) => {
		const ageMs = now - new Date(session.lastActivityAt).getTime();
		const ageMinutes = ageMs / (1000 * 60);

		let sessionScore = STATUS_WEIGHTS[session.status];
		if (session.hasPendingToolUse) {
			sessionScore += PENDING_TOOL_BONUS;
		}

		const decayFactor = Math.pow(0.5, ageMinutes / 30);
		return score + sessionScore * decayFactor;
	}, 0);
}

export interface RepoGroup {
	repoId: string;
	repoUrl: string | null;
	isGitRepo: boolean;
	sessions: Session[];
	activityScore: number;
}

/**
 * Get a display-friendly group key from a path.
 * E.g., "/Users/john/Projects/myapp" -> "~/Projects/myapp"
 */
function getPathGroupKey(cwd: string): string {
	let path = cwd;

	// Try common home patterns
	const homeMatch = cwd.match(/^\/Users\/[^/]+/);
	if (homeMatch) {
		path = '~' + cwd.slice(homeMatch[0].length);
	} else if (cwd.startsWith('/home/')) {
		const parts = cwd.split('/');
		path = '~/' + parts.slice(3).join('/');
	}

	return path || cwd;
}

/**
 * Group sessions by repo, sorted by activity score.
 * Git repos grouped by gitRepoId, non-git sessions grouped by cwd path.
 */
export function groupSessionsByRepo(sessions: Session[]): RepoGroup[] {
	const groups = new Map<string, { sessions: Session[]; isGitRepo: boolean; repoUrl: string | null }>();

	for (const session of sessions) {
		if (session.gitRepoId) {
			// Git repo - group by repo ID
			const key = session.gitRepoId;
			const existing = groups.get(key);
			if (existing) {
				existing.sessions.push(session);
			} else {
				groups.set(key, {
					sessions: [session],
					isGitRepo: true,
					repoUrl: `https://github.com/${key}`
				});
			}
		} else {
			// Non-git - group by cwd path
			const key = getPathGroupKey(session.cwd);
			const existing = groups.get(key);
			if (existing) {
				existing.sessions.push(session);
			} else {
				groups.set(key, {
					sessions: [session],
					isGitRepo: false,
					repoUrl: null
				});
			}
		}
	}

	const groupsWithScores = Array.from(groups.entries()).map(([key, data]) => ({
		repoId: key,
		repoUrl: data.repoUrl,
		isGitRepo: data.isGitRepo,
		sessions: data.sessions,
		activityScore: calculateRepoActivityScore(data.sessions)
	}));

	groupsWithScores.sort((a, b) => b.activityScore - a.activityScore);

	return groupsWithScores;
}

// Singleton store instances
let sessionsStore: Readable<Session[]> | null = null;
let machinesStore: Writable<MachineInfo[]> | null = null;

// Track shown notifications to avoid duplicates
const shownNotifications = new Set<string>();

// Notification mode preference
export type NotifyMode = 'all' | 'approval_only' | 'none';

export function getNotifyMode(): NotifyMode {
	if (typeof localStorage === 'undefined') return 'all';
	return (localStorage.getItem('notifyMode') as NotifyMode) || 'all';
}

/**
 * Request browser notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
	if (!('Notification' in window)) {
		console.log('[notify] Browser does not support notifications');
		return false;
	}

	if (Notification.permission === 'granted') {
		return true;
	}

	if (Notification.permission === 'denied') {
		console.log('[notify] Notification permission denied');
		return false;
	}

	const permission = await Notification.requestPermission();
	return permission === 'granted';
}

/**
 * Show a browser notification for a session
 */
function showNotification(session: Session): void {
	if (!session.notification) return;

	const key = `${session.sessionId}:${session.notification.timestamp}`;
	if (shownNotifications.has(key)) return;

	shownNotifications.add(key);

	// Clean up old entries (keep last 100)
	if (shownNotifications.size > 100) {
		const entries = Array.from(shownNotifications);
		entries.slice(0, entries.length - 100).forEach((e) => shownNotifications.delete(e));
	}

	if (Notification.permission !== 'granted') return;

	// Check notification mode preference
	const mode = getNotifyMode();
	if (mode === 'none') return;
	if (mode === 'approval_only' && session.notification.type !== 'needs_approval') return;

	const dirName = session.cwd.split('/').pop() || session.cwd;
	const title = session.notification.type === 'needs_approval' ? 'Needs Approval' : 'Waiting for Input';
	const body = session.gitRepoId || dirName;

	const notification = new Notification(`Claude: ${title}`, {
		body,
		tag: session.sessionId, // Replaces previous notifications for same session
		icon: '/favicon.png',
		requireInteraction: session.notification.type === 'needs_approval',
	});

	notification.onclick = () => {
		window.focus();
		notification.close();
		// TODO: Could scroll to or highlight the session
	};
}

/**
 * Create a readable store that subscribes to DB changes.
 * Uses polling since @tanstack/db doesn't expose a direct subscription API.
 */
function createSessionsStore(): Readable<Session[]> {
	return readable<Session[]>([], (set) => {
		let intervalId: ReturnType<typeof setInterval> | null = null;
		let db: SessionsDB | null = null;

		// Initialize and start polling
		getSessionsDb().then((dbInstance) => {
			db = dbInstance;

			// Initial load - use values() to get all session objects
			const sessions = Array.from(db.collections.sessions.values()) as Session[];
			set(sessions);

			// Poll for updates (the DB updates automatically via EventSource)
			intervalId = setInterval(() => {
				if (db) {
					const sessions = Array.from(db.collections.sessions.values()) as Session[];
					set(sessions);

					// Check for notifications
					for (const session of sessions) {
						if (session.notification) {
							showNotification(session);
						}
					}
				}
			}, 500); // Poll every 500ms for smooth updates
		});

		return () => {
			if (intervalId) {
				clearInterval(intervalId);
			}
		};
	});
}

/**
 * Create a writable store for machine connection status.
 */
function createMachinesStore(): Writable<MachineInfo[]> {
	const store = writable<MachineInfo[]>([]);

	// Initial fetch
	fetchMachines().then((machines) => {
		store.set(machines);
	});

	// Periodically refresh machine status
	setInterval(async () => {
		const machines = await fetchMachines();
		store.set(machines);
	}, 10000); // Refresh every 10 seconds

	return store;
}

/**
 * Get or create the sessions store singleton.
 * Must be called after getSessionsDb() has been called in a layout load.
 */
export function getSessionsStore(): Readable<Session[]> {
	if (!sessionsStore) {
		sessionsStore = createSessionsStore();
	}
	return sessionsStore;
}

/**
 * Get or create the machines store singleton.
 */
export function getMachinesStore(): Writable<MachineInfo[]> {
	if (!machinesStore) {
		machinesStore = createMachinesStore();
	}
	return machinesStore;
}

/**
 * Derived store for repo groups
 */
export function getRepoGroupsStore(): Readable<RepoGroup[]> {
	return derived(getSessionsStore(), ($sessions) => groupSessionsByRepo($sessions));
}
