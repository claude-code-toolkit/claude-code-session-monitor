<script lang="ts">
	import type { Session } from '$lib/data/schema';
	import SessionCard from './SessionCard.svelte';

	export let title: string;
	export let sessions: Session[];
	export let status: 'working' | 'pending' | 'waiting' | 'idle';

	// Terminal-style status indicators
	const statusConfig = {
		working: {
			icon: '▸',
			iconClass: 'text-active-9 animate-glow-pulse',
			label: 'text-active-11',
			count: 'text-active-10',
			bg: 'bg-active-3/20',
			border: 'border-active-6/20',
		},
		pending: {
			icon: '◆',
			iconClass: 'text-pending-9',
			label: 'text-pending-11',
			count: 'text-pending-10',
			bg: 'bg-pending-3/20',
			border: 'border-pending-6/20',
		},
		waiting: {
			icon: '○',
			iconClass: 'text-carbon-9',
			label: 'text-carbon-11',
			count: 'text-carbon-10',
			bg: 'bg-carbon-3/30',
			border: 'border-carbon-6/20',
		},
		idle: {
			icon: '·',
			iconClass: 'text-carbon-8',
			label: 'text-carbon-10',
			count: 'text-carbon-9',
			bg: 'bg-carbon-2/50',
			border: 'border-carbon-6/15',
		},
	};

	$: config = statusConfig[status];
	$: isEmpty = sessions.length === 0;
</script>

<div
	class="flex-1 min-w-[300px] max-w-[380px] flex flex-col rounded-lg border {config.border} {config.bg}"
>
	<!-- Column header -->
	<div class="flex items-center justify-between px-3 py-2.5">
		<div class="flex items-center gap-2">
			<span class="font-mono text-sm {config.iconClass}">{config.icon}</span>
			<span class="text-xs font-medium uppercase tracking-wider {config.label}">{title}</span>
		</div>
		{#if sessions.length > 0}
			<span class="text-xs font-mono {config.count} tabular-nums">{sessions.length}</span>
		{/if}
	</div>

	<!-- Cards container -->
	<div class="flex-1 px-2 pb-2 overflow-y-auto kanban-scroll max-h-[calc(100vh-200px)] min-h-[100px]">
		{#if isEmpty}
			<div class="flex items-center justify-center h-full min-h-[60px]">
				<span class="text-xs text-carbon-7 font-mono">—</span>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each sessions as session (session.sessionId)}
					<SessionCard {session} {status} />
				{/each}
			</div>
		{/if}
	</div>
</div>
