<script lang="ts">
	import { onMount } from 'svelte';
	import { getRepoGroupsStore, type RepoGroup } from '$lib/stores/sessions';
	import RepoSection from '$lib/components/RepoSection.svelte';

	let repoGroups: RepoGroup[] = [];
	let mounted = false;

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
	<div class="flex items-center justify-center py-16">
		<p class="text-slate-11 text-base">Loading sessions...</p>
	</div>
{:else if repoGroups.length === 0}
	<div class="flex flex-col items-center gap-3 py-16">
		<p class="text-slate-11 text-base">No sessions found</p>
		<p class="text-slate-11 text-sm opacity-70">Start a Claude Code session to see it here</p>
	</div>
{:else}
	<div class="flex flex-col">
		{#each repoGroups as group (group.repoId)}
			<RepoSection
				repoId={group.repoId}
				repoUrl={group.repoUrl}
				sessions={group.sessions}
				activityScore={group.activityScore}
			/>
		{/each}
	</div>
{/if}
