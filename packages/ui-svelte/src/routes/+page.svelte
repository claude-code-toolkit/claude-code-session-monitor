<script lang="ts">
	import { onMount } from 'svelte';
	import { getRepoGroupsStore, type RepoGroup } from '$lib/stores/sessions';
	import RepoSection from '$lib/components/RepoSection.svelte';

	let repoGroups: RepoGroup[] = [];
	let mounted = false;

	// Aggregate stats
	$: totalSessions = repoGroups.reduce((sum, g) => sum + g.sessions.length, 0);
	$: workingSessions = repoGroups.reduce(
		(sum, g) => sum + g.sessions.filter((s) => s.status === 'working').length,
		0
	);
	$: pendingSessions = repoGroups.reduce(
		(sum, g) => sum + g.sessions.filter((s) => s.status === 'waiting' && s.hasPendingToolUse).length,
		0
	);

	onMount(() => {
		mounted = true;
		const store = getRepoGroupsStore();
		const unsubscribe = store.subscribe((groups) => {
			repoGroups = groups;
		});

		return unsubscribe;
	});
</script>

{#if !mounted}
	<div class="flex items-center justify-center py-24">
		<div class="flex flex-col items-center gap-3">
			<span class="text-accent-9 font-mono text-lg animate-glow-pulse">▸</span>
			<p class="text-carbon-9 text-sm font-mono">loading...</p>
		</div>
	</div>
{:else if repoGroups.length === 0}
	<div class="flex flex-col items-center gap-4 py-24">
		<div class="text-4xl font-mono text-carbon-7">∅</div>
		<div class="text-center">
			<p class="text-carbon-10 text-sm">No active sessions</p>
			<p class="text-carbon-8 text-xs font-mono mt-1">run `claude` to start</p>
		</div>
	</div>
{:else}
	<!-- Stats bar - terminal style -->
	<div class="flex items-center gap-6 mb-6 pb-4 border-b border-carbon-6/30">
		<div class="flex items-center gap-4 text-xs font-mono">
			{#if workingSessions > 0}
				<span class="flex items-center gap-1.5">
					<span class="text-active-9 animate-glow-pulse">▸</span>
					<span class="text-active-11">{workingSessions} working</span>
				</span>
			{/if}
			{#if pendingSessions > 0}
				<span class="flex items-center gap-1.5">
					<span class="text-pending-9">◆</span>
					<span class="text-pending-11">{pendingSessions} pending</span>
				</span>
			{/if}
		</div>
		<span class="text-xs font-mono text-carbon-8 tabular-nums ml-auto">{totalSessions} total</span>
	</div>

	<!-- Repo sections -->
	<div class="flex flex-col gap-8">
		{#each repoGroups as group (group.repoId)}
			<RepoSection
				repoId={group.repoId}
				repoUrl={group.repoUrl}
				isGitRepo={group.isGitRepo}
				sessions={group.sessions}
			/>
		{/each}
	</div>
{/if}
