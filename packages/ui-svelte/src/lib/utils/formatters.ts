import type { CIStatus } from '$lib/data/schema';

export function formatTimeAgo(isoString: string): string {
	const now = Date.now();
	const then = new Date(isoString).getTime();
	const diff = now - then;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	if (seconds > 10) return `${seconds}s`;
	return 'now';
}

export function formatTarget(target: string): string {
	// Shorten file paths to just filename
	if (target.includes('/')) {
		const parts = target.split('/');
		return parts[parts.length - 1];
	}
	// Truncate long commands
	if (target.length > 35) {
		return target.slice(0, 32) + '...';
	}
	return target;
}

export function formatDirPath(cwd: string): string {
	// Replace home directory with ~
	const shortened = cwd.replace(/^\/Users\/[^/]+/, '~');
	// If still too long, show last 2 segments
	const parts = shortened.split('/');
	if (parts.length > 3) {
		return '.../' + parts.slice(-2).join('/');
	}
	return shortened;
}

export function getRoleColor(role: 'user' | 'assistant' | 'tool'): string {
	switch (role) {
		case 'user':
			return 'text-accent-11';  // Warm coral for user input
		case 'assistant':
			return 'text-carbon-11';
		case 'tool':
			return 'text-carbon-9';
	}
}

export function getRolePrefix(role: 'user' | 'assistant' | 'tool'): string {
	switch (role) {
		case 'user':
			return '$ ';
		case 'assistant':
			return '';
		case 'tool':
			return '> ';
	}
}

export function getCIStatusIcon(status: CIStatus): string {
	switch (status) {
		case 'success':
			return '✓';
		case 'failure':
			return '✗';
		case 'running':
			return '◦';
		case 'pending':
			return '○';
		case 'cancelled':
			return '–';
		default:
			return '?';
	}
}

export function getCIStatusColor(status: CIStatus): string {
	switch (status) {
		case 'success':
			return 'active';
		case 'failure':
			return 'error';
		case 'running':
		case 'pending':
			return 'pending';
		case 'cancelled':
			return 'carbon';
		default:
			return 'carbon';
	}
}

// Refined tool icons - using simple ASCII/Unicode symbols instead of emojis
export const toolIcons: Record<string, string> = {
	Edit: '~',
	Write: '+',
	Bash: '$',
	Read: '?',
	Grep: '/',
	Glob: '*',
	MultiEdit: '~',
	Task: '>',
	WebFetch: '@',
	WebSearch: '?',
	LSP: '#',
};
