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
	return `${seconds}s`;
}

export function formatTarget(target: string): string {
	// Shorten file paths
	if (target.includes('/')) {
		const parts = target.split('/');
		return parts[parts.length - 1];
	}
	// Truncate long commands
	if (target.length > 30) {
		return target.slice(0, 27) + '...';
	}
	return target;
}

export function formatDirPath(cwd: string): string {
	return cwd.replace(/^\/Users\/[^/]+/, '~');
}

export function getRoleColor(role: 'user' | 'assistant' | 'tool'): string {
	switch (role) {
		case 'user':
			return 'text-blue-400';
		case 'assistant':
			return 'text-slate-12';
		case 'tool':
			return 'text-violet-11';
	}
}

export function getRolePrefix(role: 'user' | 'assistant' | 'tool'): string {
	switch (role) {
		case 'user':
			return 'You: ';
		case 'assistant':
			return '';
		case 'tool':
			return '';
	}
}

export function getCIStatusIcon(status: CIStatus): string {
	switch (status) {
		case 'success':
			return '✓';
		case 'failure':
			return '✗';
		case 'running':
		case 'pending':
			return '◎';
		case 'cancelled':
			return '⊘';
		default:
			return '?';
	}
}

export function getCIStatusColor(status: CIStatus): string {
	switch (status) {
		case 'success':
			return 'grass';
		case 'failure':
			return 'red';
		case 'running':
		case 'pending':
			return 'amber';
		default:
			return 'slate';
	}
}

export const toolIcons: Record<string, string> = {
	Edit: '✏️',
	Write: '📝',
	Bash: '▶️',
	Read: '📖',
	Grep: '🔍',
	MultiEdit: '✏️'
};
