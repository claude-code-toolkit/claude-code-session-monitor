<script lang="ts">
	import type { Session } from '$lib/data/schema';
	import KanbanColumn from './KanbanColumn.svelte';
	import { dismissedSessions } from '$lib/stores/dismissed';

	export let repoId: string;
	export let repoUrl: string | null;
	export let sessions: Session[];
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let activityScore: number;

	// Auto-restore dismissed sessions that become active
	$: {
		sessions.forEach((s) => {
			if (s.status !== 'idle' && $dismissedSessions.has(s.sessionId)) {
				dismissedSessions.restore(s.sessionId);
			}
		});
	}

	$: working = sessions.filter((s) => s.status === 'working');
	$: needsApproval = sessions.filter((s) => s.status === 'waiting' && s.hasPendingToolUse);
	$: waiting = sessions.filter((s) => s.status === 'waiting' && !s.hasPendingToolUse);
	// Filter out dismissed sessions from idle
	$: idle = sessions.filter((s) => s.status === 'idle' && !$dismissedSessions.has(s.sessionId));

	// Extract repo name from ID for cleaner display
	$: displayName = repoId === 'Other' ? 'other' : repoId.split('/').pop() || repoId;
	$: orgName = repoId === 'Other' ? null : repoId.includes('/') ? repoId.split('/')[0] : null;
</script>

<section class="group">
	<!-- Repository header -->
	<div class="flex items-baseline gap-2 mb-4">
		{#if repoId === 'Other'}
			<h2 class="text-sm font-mono text-carbon-9">~/other</h2>
		{:else}
			<span class="text-sm font-mono text-carbon-8">
				{#if orgName}{orgName}/{/if}
			</span>
			{#if repoUrl}
				<a
					href={repoUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-sm font-medium text-carbon-12 hover:text-accent-9 transition-colors"
				>
					{displayName}
				</a>
			{:else}
				<h2 class="text-sm font-medium text-carbon-12">{displayName}</h2>
			{/if}
		{/if}

		<!-- Inline activity stats -->
		<div class="flex items-center gap-3 ml-2 text-2xs font-mono">
			{#if working.length > 0}
				<span class="text-active-10">{working.length} active</span>
			{/if}
			{#if needsApproval.length > 0}
				<span class="text-pending-10">{needsApproval.length} pending</span>
			{/if}
		</div>
	</div>

	<!-- Kanban columns - horizontal scroll for overflow -->
	<div class="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
		<KanbanColumn title="Working" sessions={working} status="working" />
		<KanbanColumn title="Needs Input" sessions={needsApproval} status="pending" />
		<KanbanColumn title="Waiting" sessions={waiting} status="waiting" />
		<KanbanColumn title="Idle" sessions={idle} status="idle" />
	</div>
</section>
