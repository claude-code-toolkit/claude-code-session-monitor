<script lang="ts">
	import type { Session } from '$lib/data/schema';
	import {
		formatTimeAgo,
		formatTarget,
		formatDirPath,
		getCIStatusIcon,
		getRoleColor,
		getRolePrefix,
		toolIcons
	} from '$lib/utils/formatters';
	import { dismissedSessions } from '$lib/stores/dismissed';
	import { terminals } from '$lib/stores/terminals';

	export let session: Session;
	export let status: 'working' | 'pending' | 'waiting' | 'idle' = 'idle';

	function handleDismiss(event: MouseEvent) {
		event.stopPropagation();
		dismissedSessions.dismiss(session.sessionId);
	}

	$: showPendingTool = session.hasPendingToolUse && session.pendingTool;
	$: dirPath = formatDirPath(session.cwd);
	// Check if this session has an open terminal (reactive)
	$: hasOpenTerminal = $terminals.some((t) => t.sessionId === session.sessionId);

	// Status-specific card styles
	const cardStyles = {
		working: 'shadow-card-active bg-card-gradient-active border-active-6/30',
		pending: 'shadow-card-pending bg-card-gradient-pending border-pending-6/40',
		waiting: 'shadow-card border-carbon-6/50',
		idle: 'shadow-card border-carbon-6/40',
	};

	function handleClick() {
		// Open or focus terminal for this session
		terminals.open(session.sessionId, session.cwd, session.hostname);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}

	// Hover preview with delay
	let showPreview = false;
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
	const HOVER_DELAY = 400; // ms before showing preview

	function handleMouseEnter() {
		hoverTimeout = setTimeout(() => {
			showPreview = true;
		}, HOVER_DELAY);
	}

	function handleMouseLeave() {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		showPreview = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="session-card animate-slide-in group relative bg-carbon-3 border rounded-lg overflow-hidden
		cursor-pointer transition-all duration-150 ease-out
		hover:shadow-card-hover hover:border-carbon-5 hover:bg-carbon-4
		{cardStyles[status]}"
	style="height: 120px; min-height: 120px; max-height: 120px;"
	on:click={handleClick}
	on:keydown={handleKeydown}
	on:mouseenter={handleMouseEnter}
	on:mouseleave={handleMouseLeave}
	role="button"
	tabindex="0"
>
	<!-- Subtle noise texture overlay -->
	<div class="absolute inset-0 opacity-[0.015] bg-noise pointer-events-none"></div>

	<!-- Dismiss button (idle and waiting) -->
	{#if status === 'idle' || status === 'waiting'}
		<button
			class="absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center
				text-carbon-8 hover:text-carbon-11 hover:bg-carbon-5
				opacity-0 group-hover:opacity-100 transition-opacity z-10"
			on:click={handleDismiss}
			title="Dismiss session"
		>
			<span class="text-xs">✕</span>
		</button>
	{/if}

	<div class="relative px-3 py-2.5 h-full flex flex-col overflow-hidden">
		<!-- Status badge - terminal style -->
		<div class="flex items-center justify-between gap-2 mb-1.5 shrink-0 overflow-hidden">
			<div class="flex items-center gap-2">
				{#if status === 'working'}
					<span class="inline-flex items-center gap-1.5 text-2xs font-mono shrink-0">
						<span class="text-active-9 animate-glow-pulse">▸</span>
						<span class="text-active-11 uppercase tracking-wider">working</span>
					</span>
				{:else if status === 'pending'}
					<span class="inline-flex items-center gap-1.5 text-2xs font-mono shrink-0">
						<span class="text-pending-9">◆</span>
						<span class="text-pending-11 uppercase tracking-wider">needs input</span>
					</span>
				{:else if status === 'waiting'}
					<span class="inline-flex items-center gap-1.5 text-2xs font-mono text-carbon-9 shrink-0">
						<span>○</span>
						<span class="uppercase tracking-wider">waiting</span>
					</span>
				{:else}
					<span class="inline-flex items-center gap-1.5 text-2xs font-mono text-carbon-8 shrink-0">
						<span>·</span>
						<span class="uppercase tracking-wider">idle</span>
					</span>
				{/if}

				{#if hasOpenTerminal}
					<span class="text-2xs font-mono text-accent-9 shrink-0" title="Terminal open">▣</span>
				{/if}
			</div>

			<span class="text-2xs font-mono text-carbon-8 tabular-nums shrink-0">{formatTimeAgo(session.lastActivityAt)}</span>
		</div>

		<!-- Goal - primary content, single line truncated -->
		<div class="mb-1 overflow-hidden">
			<p class="text-[15px] font-medium text-carbon-12 leading-snug truncate">
				{session.goal || session.originalPrompt.slice(0, 80) || 'No goal'}
			</p>
		</div>

		<!-- Pending tool OR summary - secondary, fixed height -->
		<div class="h-[20px] overflow-hidden">
			{#if showPendingTool && session.pendingTool}
				<code class="text-xs font-mono text-pending-10 bg-pending-3/50 px-1.5 py-0.5 rounded truncate inline-block max-w-full">
					<span class="text-pending-9">{toolIcons[session.pendingTool.tool] || '›'}</span>
					{session.pendingTool.tool}:{formatTarget(session.pendingTool.target)}
				</code>
			{:else if session.summary}
				<p class="text-xs text-carbon-9 truncate">{session.summary}</p>
			{/if}
		</div>

		<!-- Footer: Branch/PR + message count -->
		<div class="flex items-center justify-between gap-3 pt-2 border-t border-carbon-6/30 shrink-0 mt-auto overflow-hidden">
			<div class="flex items-center gap-2 min-w-0 overflow-hidden">
				{#if session.pr}
					<a
						href={session.pr.url}
						target="_blank"
						rel="noopener noreferrer"
						on:click|stopPropagation
						class="inline-flex items-center gap-1 text-2xs font-mono px-1.5 py-0.5 rounded
							bg-carbon-5/50 text-carbon-11 hover:bg-carbon-6 transition-colors shrink-0"
					>
						<span class="text-{session.pr.ciStatus === 'success' ? 'active' : session.pr.ciStatus === 'failure' ? 'error' : 'carbon'}-9">
							{getCIStatusIcon(session.pr.ciStatus)}
						</span>
						#{session.pr.number}
					</a>
				{:else if session.gitBranch}
					<code class="text-2xs font-mono text-carbon-10 truncate">
						{session.gitBranch}
					</code>
				{:else}
					<span class="text-2xs font-mono text-carbon-8 truncate">{dirPath}</span>
				{/if}
			</div>

			<div class="flex items-center gap-2 shrink-0">
				{#if session.hostname}
					<span class="text-2xs font-mono text-carbon-7 truncate max-w-[80px]" title={session.hostname}>@{session.hostname}</span>
				{/if}
				<span class="text-2xs font-mono text-carbon-8 tabular-nums whitespace-nowrap">{session.messageCount} msg</span>
			</div>
		</div>
	</div>

	<!-- Preview popup (on hover) -->
	{#if showPreview && session.recentOutput?.length > 0}
		<div
			class="absolute left-full top-0 ml-3 z-50 w-[440px] max-h-[380px]
				bg-carbon-2 border border-carbon-6/80 rounded-lg shadow-popup backdrop-blur-sm
				flex flex-col animate-fade-in pointer-events-none"
		>
			<!-- Noise overlay for popup too -->
			<div class="absolute inset-0 opacity-[0.02] bg-noise pointer-events-none rounded-lg"></div>

			<!-- Preview header -->
			<div class="relative px-3 py-2.5 border-b border-carbon-6/50">
				<div class="flex items-center justify-between mb-1">
					<span class="text-sm font-medium text-carbon-12 truncate flex-1">
						{session.goal || session.originalPrompt.slice(0, 50)}
					</span>
					<code class="text-2xs font-mono text-carbon-8 ml-2 shrink-0">{session.sessionId.slice(0, 8)}</code>
				</div>
				{#if session.summary}
					<p class="text-xs text-carbon-9 truncate">{session.summary}</p>
				{/if}
			</div>

			<!-- Recent output - terminal style -->
			<div class="relative flex-1 overflow-hidden p-3">
				<div class="bg-carbon-1 rounded border border-carbon-6/40 p-3 max-h-[260px] overflow-y-auto font-mono text-xs space-y-1.5">
					{#each session.recentOutput as output}
						<div class="{getRoleColor(output.role)} leading-relaxed">
							{#if output.role === 'user'}
								<span class="text-accent-9 select-none">❯ </span><span class="whitespace-pre-wrap">{output.content}</span>
							{:else if output.role === 'tool'}
								<span class="text-carbon-7 select-none">  </span><span class="text-carbon-10">{output.content}</span>
							{:else}
								<span class="whitespace-pre-wrap">{output.content}</span>
							{/if}
						</div>
					{/each}
					{#if status === 'working'}
						<span class="text-active-9 animate-glow-pulse">▌</span>
					{/if}
				</div>
			</div>

			<!-- Preview footer -->
			<div class="relative px-3 py-2 border-t border-carbon-6/50 flex items-center justify-between text-2xs text-carbon-9 font-mono">
				<span class="truncate">{dirPath}</span>
				{#if session.pr}
					<span class="shrink-0 ml-2">PR #{session.pr.number}</span>
				{:else if session.gitBranch}
					<span class="shrink-0 ml-2 truncate max-w-[140px]">{session.gitBranch}</span>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
