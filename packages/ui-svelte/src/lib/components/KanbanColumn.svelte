<script lang="ts">
	import type { Session } from '$lib/data/schema';
	import SessionCard from './SessionCard.svelte';

	export let title: string;
	export let sessions: Session[];
	export let color: 'green' | 'orange' | 'yellow' | 'gray';

	const bgColors: Record<string, string> = {
		green: 'bg-grass-3/50 border-grass-6',
		orange: 'bg-orange-3/50 border-orange-6',
		yellow: 'bg-amber-3/50 border-amber-6',
		gray: 'bg-slate-3/50 border-slate-6'
	};

	const headerBorderColors: Record<string, string> = {
		green: 'border-l-grass-9',
		orange: 'border-l-orange-9',
		yellow: 'border-l-amber-9',
		gray: 'border-l-slate-9'
	};

	const countColors: Record<string, string> = {
		green: 'text-grass-11',
		orange: 'text-orange-11',
		yellow: 'text-amber-11',
		gray: 'text-slate-11'
	};
</script>

<div class="flex-1 min-w-[280px] max-w-[400px] {bgColors[color]} border rounded-xl p-3">
	<div class="flex flex-col gap-3 h-full">
		<!-- Header -->
		<div class="flex justify-between items-center">
			<h3 class="font-heading text-base font-bold border-l-4 pl-2 {headerBorderColors[color]}">
				{title}
			</h3>
			<span class="text-sm font-bold {countColors[color]}">{sessions.length}</span>
		</div>

		<!-- Cards list with scroll -->
		<div class="flex-1 overflow-y-auto max-h-[500px]">
			<div class="flex flex-col gap-2 pr-1">
				{#each sessions as session (session.sessionId)}
					<SessionCard {session} />
				{/each}
				{#if sessions.length === 0}
					<p class="text-sm text-slate-11 text-center py-8 opacity-60">No sessions</p>
				{/if}
			</div>
		</div>
	</div>
</div>
