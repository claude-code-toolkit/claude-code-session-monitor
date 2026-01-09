<script lang="ts">
	import type { Session } from '$lib/data/schema';
	import KanbanColumn from './KanbanColumn.svelte';

	export let repoId: string;
	export let repoUrl: string | null;
	export let sessions: Session[];
	export let activityScore: number;

	$: working = sessions.filter((s) => s.status === 'working');
	$: needsApproval = sessions.filter((s) => s.status === 'waiting' && s.hasPendingToolUse);
	$: waiting = sessions.filter((s) => s.status === 'waiting' && !s.hasPendingToolUse);
	$: idle = sessions.filter((s) => s.status === 'idle');
	$: isHot = activityScore > 50;
</script>

<section class="mb-8">
	<!-- Header -->
	<div class="flex items-center gap-3 mb-4">
		<h2 class="font-heading text-xl font-bold">
			{#if repoId === 'Other'}
				<span class="text-slate-11">Other</span>
			{:else if repoUrl}
				<a
					href={repoUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-violet-11 hover:text-violet-12 hover:underline"
				>
					{repoId}
				</a>
			{:else}
				{repoId}
			{/if}
		</h2>
		{#if isHot}
			<span class="text-sm" title="High activity">🔥</span>
		{/if}
		<span class="text-sm text-slate-11">
			{sessions.length} session{sessions.length !== 1 ? 's' : ''}
		</span>
	</div>

	<!-- Kanban columns -->
	<div class="flex gap-3 overflow-x-auto pb-2">
		<KanbanColumn title="Working" sessions={working} color="green" />
		<KanbanColumn title="Needs Approval" sessions={needsApproval} color="orange" />
		<KanbanColumn title="Waiting" sessions={waiting} color="yellow" />
		<KanbanColumn title="Idle" sessions={idle} color="gray" />
	</div>

	<!-- Separator -->
	<hr class="mt-6 border-slate-6" />
</section>
