<script lang="ts">
	import { terminals, activeTerminal, terminalPanel, closeTerminal, focusTerminal, hidePanel, openLauncher, openTerminal } from '$lib/stores/terminals';
	import Terminal from './Terminal.svelte';

	// Panel width state (could be made resizable later)
	let panelWidth = 600;

	// Track Terminal component refs for focusing
	let terminalRefs: Record<string, Terminal> = {};

	// Loading state for new terminal button
	let creatingLauncher = false;

	function handleTabClick(sessionId: string) {
		focusTerminal(sessionId);
		// Focus the terminal after a tick to ensure it's visible
		setTimeout(() => {
			terminalRefs[sessionId]?.focus();
		}, 0);
	}

	async function handleNewTerminal() {
		if (creatingLauncher) return;
		creatingLauncher = true;
		try {
			await openLauncher();
		} catch (error) {
			console.error('Failed to create launcher:', error);
		} finally {
			creatingLauncher = false;
		}
	}

	function handleLauncherComplete(launcherSessionId: string, newSessionId: string, newCwd: string) {
		// Close the launcher tab
		closeTerminal(launcherSessionId);
		// Open terminal for the new session
		openTerminal(newSessionId, newCwd, 'local');
	}

	function handleKeydown(event: KeyboardEvent) {
		// ESC to hide panel
		if (event.key === 'Escape') {
			hidePanel();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $terminalPanel && $terminals.length > 0}
	<div class="terminal-panel" style="width: {panelWidth}px">
		<!-- Tab bar -->
		<div class="tab-bar">
			<div class="tabs">
				{#each $terminals as tab (tab.sessionId)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="tab"
						class:active={$activeTerminal === tab.sessionId}
						class:launcher={!!tab.launcherId}
						on:click={() => handleTabClick(tab.sessionId)}
						title="{tab.cwd}\n@{tab.hostname}"
						role="tab"
						tabindex="0"
					>
						{#if tab.launcherId}
							<svg class="tab-icon launcher-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
								<path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						{/if}
						<span class="tab-title">{tab.title}</span>
						<span class="tab-host">@{tab.hostname}</span>
						<button
							class="tab-close"
							on:click|stopPropagation={() => closeTerminal(tab.sessionId)}
							title="Close terminal"
						>
							<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
								<path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						</button>
					</div>
				{/each}
			</div>

			<div class="tab-actions">
				<button
					class="new-terminal-btn"
					on:click={handleNewTerminal}
					disabled={creatingLauncher}
					title="New terminal (pick directory)"
				>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
						<path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>

				<button class="collapse-btn" on:click={hidePanel} title="Collapse panel (ESC)">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
		</div>

		<!-- Terminal content -->
		<div class="terminal-content">
			{#each $terminals as tab (tab.sessionId)}
				<div
					class="terminal-instance"
					class:active={$activeTerminal === tab.sessionId}
				>
					<Terminal
						bind:this={terminalRefs[tab.sessionId]}
						sessionId={tab.sessionId}
						launcherId={tab.launcherId}
						cwd={tab.cwd}
						hostname={tab.hostname}
						onClose={() => closeTerminal(tab.sessionId)}
						onLauncherComplete={tab.launcherId ? (newSessionId, newCwd) => handleLauncherComplete(tab.sessionId, newSessionId, newCwd) : undefined}
					/>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.terminal-panel {
		position: fixed;
		top: 0;
		right: 0;
		height: 100vh;
		background: #0d0d0d;
		border-left: 1px solid #2a2a2a;
		display: flex;
		flex-direction: column;
		z-index: 50;
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
	}

	.tab-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #1a1a1a;
		border-bottom: 1px solid #2a2a2a;
		padding: 0 4px;
		min-height: 36px;
	}

	.tabs {
		display: flex;
		gap: 2px;
		overflow-x: auto;
		flex: 1;
		padding: 4px 0;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #808080;
		font-size: 11px;
		font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.tab:hover {
		background: #2a2a2a;
		color: #a0a0a0;
	}

	.tab.active {
		background: #0d0d0d;
		color: #e0e0e0;
	}

	.tab-title {
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tab-host {
		color: #535965;
		font-size: 10px;
	}

	.tab-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		margin-left: 2px;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: #535965;
		cursor: pointer;
		opacity: 0;
		transition: all 0.15s;
	}

	.tab:hover .tab-close,
	.tab.active .tab-close {
		opacity: 1;
	}

	.tab-close:hover {
		background: rgba(229, 85, 97, 0.2);
		color: #e55561;
	}

	.tab-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.new-terminal-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #535965;
		cursor: pointer;
		transition: all 0.15s;
	}

	.new-terminal-btn:hover:not(:disabled) {
		background: #2a2a2a;
		color: #bf68d9;
	}

	.new-terminal-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.tab.launcher .tab-title {
		color: #bf68d9;
	}

	.tab-icon {
		flex-shrink: 0;
	}

	.launcher-icon {
		color: #bf68d9;
	}

	.collapse-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #535965;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.collapse-btn:hover {
		background: #2a2a2a;
		color: #a0a0a0;
	}

	.terminal-content {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	.terminal-instance {
		position: absolute;
		inset: 0;
		display: none;
	}

	.terminal-instance.active {
		display: flex;
	}
</style>
