import { readable, derived, type Readable } from 'svelte/store';
import { getSessionsDb, type SessionsDB } from '$lib/data/sessionsDb';
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

// Singleton store instance
let sessionsStore: Readable<Session[]> | null = null;

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
 * Derived store for repo groups
 */
export function getRepoGroupsStore(): Readable<RepoGroup[]> {
	return derived(getSessionsStore(), ($sessions) => groupSessionsByRepo($sessions));
}
