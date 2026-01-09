import { getSessionsDb } from '$lib/data/sessionsDb';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
	// Initialize db and preload data before any route renders
	await getSessionsDb();
	return {};
};

// Client-side only - no SSR
export const ssr = false;
export const prerender = false;
