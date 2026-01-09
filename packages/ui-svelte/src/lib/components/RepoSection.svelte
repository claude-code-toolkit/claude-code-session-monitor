<script lang="ts">
	import type { Session } from '$lib/data/schema';
	import KanbanColumn from './KanbanColumn.svelte';
	import { dismissedSessions, maxAgeHours, isSessionTooOld, collapsedSections } from '$lib/stores/dismissed';

	export let repoId: string;
	export let repoUrl: string | null;
	export let sessions: Session[];

	$: isCollapsed = $collapsedSections.has(repoId);

	// Auto-restore dismissed sessions that become active
	$: {
		sessions.forEach((s) => {
			if (s.status !== 'idle' && $dismissedSessions.has(s.sessionId)) {
				dismissedSessions.restore(s.sessionId);
			}
		});
	}

	// Filter out sessions that are too old (only for idle)
	$: filteredSessions = sessions.filter((s) => {
		// Always show active sessions regardless of age
		if (s.status !== 'idle') return true;
		// Hide old idle sessions
		return !isSessionTooOld(s.lastActivityAt, $maxAgeHours);
	});

	$: working = filteredSessions.filter((s) => s.status === 'working');
	$: needsApproval = filteredSessions.filter((s) => s.status === 'waiting' && s.hasPendingToolUse);
	$: waiting = filteredSessions.filter((s) => s.status === 'waiting' && !s.hasPendingToolUse);
	// Filter out dismissed sessions from idle
	$: idle = filteredSessions.filter((s) => s.status === 'idle' && !$dismissedSessions.has(s.sessionId));

	$: totalVisible = working.length + needsApproval.length + waiting.length + idle.length;

	// Extract repo name from ID for cleaner display
	$: displayName = repoId === 'Other' ? 'other' : repoId.split('/').pop() || repoId;
	$: orgName = repoId === 'Other' ? null : repoId.includes('/') ? repoId.split('/')[0] : null;

	function toggleCollapsed() {
		collapsedSections.toggle(repoId);
	}
</script>

<section class="group">
	<!-- Repository header -->
	<button
		class="flex items-center gap-2 mb-4 w-full text-left hover:opacity-80 transition-opacity"
		on:click={toggleCollapsed}
	>
		<!-- Collapse indicator -->
		<span class="text-carbon-8 font-mono text-xs w-4 shrink-0">
			{isCollapsed ? '▸' : '▾'}
		</span>

		{#if repoId === 'Other'}
			<h2 class="text-sm font-mono text-carbon-9">~/other</h2>
		{:else}
			<span class="text-sm font-mono text-carbon-8">
				{#if orgName}{orgName}/{/if}
			</span>
			{#if repoUrl}
				<span class="text-sm font-medium text-carbon-12">{displayName}</span>
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
			{#if isCollapsed}
				<span class="text-carbon-8">{totalVisible} sessions</span>
			{/if}
		</div>
	</button>

	<!-- Kanban columns - horizontal scroll for overflow -->
	{#if !isCollapsed}
		<div class="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
			<KanbanColumn title="Working" sessions={working} status="working" />
			<KanbanColumn title="Needs Input" sessions={needsApproval} status="pending" />
			<KanbanColumn title="Waiting" sessions={waiting} status="waiting" />
			<KanbanColumn title="Idle" sessions={idle} status="idle" />
		</div>
	{/if}
</section>
