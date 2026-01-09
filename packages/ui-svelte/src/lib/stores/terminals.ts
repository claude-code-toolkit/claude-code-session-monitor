/**
 * Terminal store - tracks open terminal tabs in the UI.
 */

import { writable, get } from 'svelte/store';

const API_BASE = 'http://127.0.0.1:4451';

export interface TerminalTab {
	sessionId: string;
	launcherId?: string; // For launcher tabs (directory picker)
	cwd: string;
	hostname: string;
	title: string; // Display title (usually repo/dir name)
}

// Store for open terminals
const openTerminals = writable<TerminalTab[]>([]);

// Store for active (focused) terminal
const activeTerminalId = writable<string | null>(null);

// Store for panel visibility
const panelVisible = writable(false);

// Derived: check if a session has an open terminal
export function hasTerminal(sessionId: string): boolean {
	return get(openTerminals).some((t) => t.sessionId === sessionId);
}

// Open a terminal for a session
export function openTerminal(sessionId: string, cwd: string, hostname: string = 'local'): void {
	const terminals = get(openTerminals);

	// Check if already open
	const existing = terminals.find((t) => t.sessionId === sessionId);
	if (existing) {
		// Just focus it
		activeTerminalId.set(sessionId);
		panelVisible.set(true);
		return;
	}

	// Extract title from cwd (last directory component)
	const title = cwd.split('/').pop() || cwd;

	// Add new terminal
	openTerminals.update((tabs) => [
		...tabs,
		{ sessionId, cwd, hostname, title },
	]);

	// Focus it and show panel
	activeTerminalId.set(sessionId);
	panelVisible.set(true);
}

// Open a launcher terminal (fzf directory picker)
export async function openLauncher(hostname: string = 'local'): Promise<void> {
	try {
		// Create launcher via REST API
		const response = await fetch(`${API_BASE}/terminals/launcher`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hostname }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to create launcher');
		}

		const { launcherId } = await response.json();

		// Add launcher tab
		const sessionId = `launcher-${launcherId}`;
		openTerminals.update((tabs) => [
			...tabs,
			{
				sessionId,
				launcherId,
				cwd: '~', // Placeholder - launcher starts in home
				hostname,
				title: 'New Session',
			},
		]);

		// Focus it and show panel
		activeTerminalId.set(sessionId);
		panelVisible.set(true);
	} catch (error) {
		console.error('Failed to open launcher:', error);
		throw error;
	}
}

// Close a terminal
export function closeTerminal(sessionId: string): void {
	openTerminals.update((tabs) => {
		const newTabs = tabs.filter((t) => t.sessionId !== sessionId);

		// If we closed the active terminal, focus another
		if (get(activeTerminalId) === sessionId) {
			const idx = tabs.findIndex((t) => t.sessionId === sessionId);
			const newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.sessionId ?? null;
			activeTerminalId.set(newActive);

			// Hide panel if no terminals left
			if (newTabs.length === 0) {
				panelVisible.set(false);
			}
		}

		return newTabs;
	});
}

// Focus a terminal
export function focusTerminal(sessionId: string): void {
	if (hasTerminal(sessionId)) {
		activeTerminalId.set(sessionId);
		panelVisible.set(true);
	}
}

// Toggle panel visibility
export function togglePanel(): void {
	panelVisible.update((v) => !v);
}

// Hide panel
export function hidePanel(): void {
	panelVisible.set(false);
}

// Show panel
export function showPanel(): void {
	panelVisible.set(true);
}

// Exports
export const terminals = {
	subscribe: openTerminals.subscribe,
	open: openTerminal,
	openLauncher,
	close: closeTerminal,
	focus: focusTerminal,
	has: hasTerminal,
};

export const activeTerminal = {
	subscribe: activeTerminalId.subscribe,
	set: activeTerminalId.set,
};

export const terminalPanel = {
	subscribe: panelVisible.subscribe,
	toggle: togglePanel,
	hide: hidePanel,
	show: showPanel,
};
