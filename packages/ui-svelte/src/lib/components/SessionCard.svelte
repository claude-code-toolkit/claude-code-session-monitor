<script lang="ts">
	import type { Session } from '$lib/data/schema';
	import { focusOrOpenSession, getLastAgentMessage } from '$lib/utils/api';
	import {
		formatTimeAgo,
		formatTarget,
		formatDirPath,
		getCIStatusIcon,
		getCIStatusColor,
		getRoleColor,
		getRolePrefix,
		toolIcons
	} from '$lib/utils/formatters';

	export let session: Session;

	$: showPendingTool = session.hasPendingToolUse && session.pendingTool;
	$: dirPath = formatDirPath(session.cwd);
	$: cardClasses = getCardClasses(session);

	function getCardClasses(session: Session): string {
		const classes = ['session-card', 'animate-slide-up'];
		if (session.status === 'working') {
			classes.push('animate-pulse-glow');
		}
		if (session.status === 'waiting' && session.hasPendingToolUse) {
			classes.push('animate-wiggle', 'status-needs-approval');
		}
		return classes.join(' ');
	}

	async function handleClick() {
		const lastAgentMessage = getLastAgentMessage(session);
		await focusOrOpenSession(session.cwd, session.sessionId, session.status, lastAgentMessage);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			handleClick();
		}
	}

	let showHover = false;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="{cardClasses} relative bg-slate-2 border border-slate-6 rounded-lg p-3 cursor-pointer
		transition-all duration-200 ease-out overflow-hidden
		hover:-translate-y-1 hover:rotate-[0.5deg] hover:shadow-xl hover:shadow-slate-1/50"
	on:click={handleClick}
	on:keydown={handleKeydown}
	on:mouseenter={() => (showHover = true)}
	on:mouseleave={() => (showHover = false)}
	role="button"
	tabindex="0"
>
	<div class="flex flex-col gap-2 overflow-hidden">
		<!-- Header: directory and time -->
		<div class="flex justify-between items-center gap-2">
			<span class="text-xs text-slate-11 font-mono truncate">{dirPath}</span>
			<span class="text-xs text-slate-11 shrink-0">{formatTimeAgo(session.lastActivityAt)}</span>
		</div>

		<!-- Main content: goal -->
		<p class="text-sm font-medium text-slate-12 truncate">
			{session.goal || session.originalPrompt.slice(0, 50) || 'No goal'}
		</p>

		<!-- Secondary: pending tool or summary -->
		{#if showPendingTool && session.pendingTool}
			<div class="flex items-center gap-2 overflow-hidden">
				<span class="text-xs text-slate-11 shrink-0">{toolIcons[session.pendingTool.tool] || '🔧'}</span>
				<code class="text-xs bg-orange-3 text-orange-11 px-1.5 py-0.5 rounded truncate">
					{session.pendingTool.tool}: {formatTarget(session.pendingTool.target)}
				</code>
			</div>
		{:else}
			<p class="text-xs text-slate-11 truncate">{session.summary || 'No activity'}</p>
		{/if}

		<!-- Footer: branch/PR and message count -->
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2 overflow-hidden min-w-0">
				{#if session.pr}
					<a
						href={session.pr.url}
						target="_blank"
						rel="noopener noreferrer"
						on:click|stopPropagation
						class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded
							bg-{getCIStatusColor(session.pr.ciStatus)}-3
							text-{getCIStatusColor(session.pr.ciStatus)}-11
							hover:opacity-80 shrink-0"
					>
						{getCIStatusIcon(session.pr.ciStatus)} #{session.pr.number}
					</a>
				{:else if session.gitBranch}
					<code class="text-xs bg-slate-3 text-slate-11 px-1.5 py-0.5 rounded truncate">
						{session.gitBranch.length > 20
							? session.gitBranch.slice(0, 17) + '...'
							: session.gitBranch}
					</code>
				{/if}
			</div>
			<span class="text-xs text-slate-11 shrink-0">{session.messageCount} msgs</span>
		</div>
	</div>

	<!-- Hover Card -->
	{#if showHover}
		<div
			class="absolute left-full top-0 ml-4 z-50 w-[500px] min-h-[300px] max-h-[400px]
				bg-slate-2 border border-slate-6 rounded-xl p-4 shadow-2xl
				flex flex-col gap-3"
		>
			<!-- Header: goal -->
			<h3 class="text-sm font-bold text-slate-12">
				{session.goal || session.originalPrompt.slice(0, 60)}
			</h3>

			<!-- Recent output -->
			<div class="flex-1 bg-slate-3 rounded-lg p-3 overflow-auto">
				{#if session.recentOutput?.length > 0}
					{#each session.recentOutput as output, i}
						<p
							class="{getRoleColor(output.role)} text-xs whitespace-pre-wrap"
							class:mb-2={i < session.recentOutput.length - 1}
						>
							{getRolePrefix(output.role)}{output.content}
						</p>
					{/each}
					{#if session.status === 'working'}
						<span class="text-grass-9 text-xs">█</span>
					{/if}
				{:else}
					<p class="text-xs text-slate-11">No recent output</p>
				{/if}
			</div>

			<!-- PR Info if available -->
			{#if session.pr}
				<div>
					<a
						href={session.pr.url}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs font-medium text-violet-11 hover:text-violet-12"
					>
						PR #{session.pr.number}: {session.pr.title}
					</a>
					{#if session.pr.ciChecks.length > 0}
						<div class="flex gap-2 flex-wrap mt-2">
							{#each session.pr.ciChecks as check}
								<span
									class="text-xs px-1.5 py-0.5 rounded
										bg-{getCIStatusColor(check.status)}-3
										text-{getCIStatusColor(check.status)}-11"
								>
									{getCIStatusIcon(check.status)}
									{check.name.slice(0, 20)}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Footer -->
			<div class="flex justify-between text-xs text-slate-11">
				<span class="font-mono">{dirPath}</span>
				<span class="font-mono">{session.sessionId.slice(0, 8)}</span>
			</div>
		</div>
	{/if}
</div>
