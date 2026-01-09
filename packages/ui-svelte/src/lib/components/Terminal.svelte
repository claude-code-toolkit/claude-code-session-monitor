<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import { WebLinksAddon } from '@xterm/addon-web-links';
	import '@xterm/xterm/css/xterm.css';

	export let sessionId: string;
	export let launcherId: string | undefined = undefined;
	export let cwd: string;
	export let hostname: string = 'local';
	export let onClose: (() => void) | undefined = undefined;
	export let onLauncherComplete: ((newSessionId: string, newCwd: string) => void) | undefined = undefined;

	const API_PORT = 4451;
	const WS_URL = `ws://127.0.0.1:${API_PORT}/terminal`;

	let terminalEl: HTMLDivElement;
	let terminal: Terminal | null = null;
	let fitAddon: FitAddon | null = null;
	let ws: WebSocket | null = null;
	let connected = false;
	let error: string | null = null;
	let warning: string | null = null;
	let tmuxSession: string | null = null;

	// Determine if this is a launcher terminal
	$: isLauncher = !!launcherId;

	// Filter out terminal capability query responses that get echoed back
	// DA1: \x1b[?1;2c  DA2: \x1b[>0;276;0c  etc.
	function filterTerminalOutput(data: string): string {
		// Remove DA1 responses: ESC [ ? <params> c (with or without ESC)
		// Remove DA2 responses: ESC [ > <params> c (with or without ESC)
		return data
			.replace(/\x1b\[\?[\d;]*c/g, '')
			.replace(/\x1b\[>[\d;]*c/g, '')
			.replace(/\[\?[\d;]*c/g, '')
			.replace(/\[>[\d;]*c/g, '');
	}

	function connect() {
		// Build URL based on whether this is a launcher or regular session
		let url: string;
		if (launcherId) {
			url = `${WS_URL}?launcherId=${encodeURIComponent(launcherId)}&hostname=${encodeURIComponent(hostname)}`;
		} else {
			url = `${WS_URL}?sessionId=${encodeURIComponent(sessionId)}&cwd=${encodeURIComponent(cwd)}&hostname=${encodeURIComponent(hostname)}`;
		}
		ws = new WebSocket(url);

		ws.onopen = () => {
			connected = true;
			error = null;
			// Send initial resize
			if (terminal && fitAddon) {
				fitAddon.fit();
				sendResize();
			}
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				switch (msg.type) {
					case 'output':
						terminal?.write(filterTerminalOutput(msg.data));
						break;
					case 'attached':
						console.log(`[terminal] Attached to PTY ${msg.ptyId}, tmux: ${msg.tmuxSession}`);
						tmuxSession = msg.tmuxSession ?? null;
						if (msg.warning) {
							warning = msg.warning;
						}
						break;
					case 'exit':
						console.log(`[terminal] PTY exited (code: ${msg.code})`);
						terminal?.write(`\r\n\x1b[33mSession ended (exit code: ${msg.code ?? 'N/A'})\x1b[0m\r\n`);
						connected = false;
						// Auto-close tab after brief delay so user can see exit message
						if (onClose) {
							setTimeout(() => onClose(), 1500);
						}
						break;
					case 'launcher_complete':
						// Launcher finished, new session created
						console.log(`[terminal] Launcher complete: new session ${msg.sessionId} in ${msg.cwd}`);
						if (onLauncherComplete) {
							onLauncherComplete(msg.sessionId, msg.cwd);
						}
						break;
					case 'pong':
						// Heartbeat response
						break;
				}
			} catch {
				// Non-JSON message, write directly
				terminal?.write(event.data);
			}
		};

		ws.onclose = () => {
			connected = false;
			if (!error) {
				terminal?.write('\r\n\x1b[90mDisconnected from server\x1b[0m\r\n');
			}
		};

		ws.onerror = () => {
			error = 'Connection failed';
			connected = false;
		};
	}

	function sendInput(data: string) {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'input', data }));
		}
	}

	function sendResize() {
		if (ws?.readyState === WebSocket.OPEN && terminal) {
			ws.send(JSON.stringify({
				type: 'resize',
				cols: terminal.cols,
				rows: terminal.rows,
			}));
		}
	}

	function handleResize() {
		if (fitAddon && terminal) {
			fitAddon.fit();
			sendResize();
		}
	}

	onMount(() => {
		// Create terminal instance
		terminal = new Terminal({
			cursorBlink: true,
			cursorStyle: 'bar',
			fontSize: 13,
			fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
			theme: {
				background: '#0d0d0d',
				foreground: '#e0e0e0',
				cursor: '#e0e0e0',
				cursorAccent: '#0d0d0d',
				selectionBackground: 'rgba(255, 255, 255, 0.2)',
				black: '#1a1a1a',
				red: '#e55561',
				green: '#8ebd6b',
				yellow: '#e2b86b',
				blue: '#4fa6ed',
				magenta: '#bf68d9',
				cyan: '#48b0bd',
				white: '#a0a8b7',
				brightBlack: '#535965',
				brightRed: '#e55561',
				brightGreen: '#8ebd6b',
				brightYellow: '#e2b86b',
				brightBlue: '#4fa6ed',
				brightMagenta: '#bf68d9',
				brightCyan: '#48b0bd',
				brightWhite: '#e0e0e0',
			},
			allowTransparency: true,
			scrollback: 10000,
		});

		// Add addons
		fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.loadAddon(new WebLinksAddon());

		// Open terminal in container
		terminal.open(terminalEl);
		fitAddon.fit();

		// Handle input
		terminal.onData((data) => {
			sendInput(data);
		});

		// Handle resize
		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(terminalEl);

		// Connect to daemon
		connect();

		// Auto-focus terminal on mount
		terminal.focus();

		// Cleanup
		return () => {
			resizeObserver.disconnect();
		};
	});

	onDestroy(() => {
		if (ws) {
			ws.close();
			ws = null;
		}
		if (terminal) {
			terminal.dispose();
			terminal = null;
		}
	});

	// Expose focus method for parent components
	export function focus() {
		terminal?.focus();
	}
</script>

<div class="terminal-wrapper">
	<div class="terminal-header">
		<div class="terminal-info">
			{#if isLauncher}
				<span class="launcher-badge">New Session</span>
				<span class="divider">•</span>
				<span class="hostname">{hostname}</span>
			{:else}
				<span class="session-id">{sessionId.slice(0, 8)}</span>
				<span class="divider">/</span>
				<span class="hostname">{hostname}</span>
			{/if}
			{#if connected}
				<span class="status connected" title="Connected"></span>
			{:else}
				<span class="status disconnected" title="Disconnected"></span>
			{/if}
		</div>
		{#if onClose}
			<button class="close-btn" on:click={onClose} title="Close terminal">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		{/if}
	</div>

	{#if error}
		<div class="terminal-error">
			<span>{error}</span>
			<button on:click={connect}>Retry</button>
		</div>
	{/if}

	{#if warning}
		<div class="terminal-warning">
			<div class="warning-content">
				<svg class="warning-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M7 1L13 12H1L7 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
					<path d="M7 5v3M7 10v0.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				<pre class="warning-text">{warning}</pre>
			</div>
			<button class="dismiss-btn" on:click={() => warning = null} title="Dismiss">
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	{/if}

	<div class="terminal-container" bind:this={terminalEl}></div>
</div>

<style>
	.terminal-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0d0d0d;
		border-radius: 8px;
		overflow: hidden;
	}

	.terminal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: #1a1a1a;
		border-bottom: 1px solid #2a2a2a;
	}

	.terminal-info {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
		font-size: 11px;
	}

	.session-id {
		color: #4fa6ed;
	}

	.launcher-badge {
		color: #bf68d9;
		font-weight: 500;
	}

	.divider {
		color: #535965;
	}

	.hostname {
		color: #8ebd6b;
	}

	.status {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-left: 4px;
	}

	.status.connected {
		background: #8ebd6b;
	}

	.status.disconnected {
		background: #e55561;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #535965;
		cursor: pointer;
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: #2a2a2a;
		color: #e55561;
	}

	.terminal-error {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 8px;
		background: rgba(229, 85, 97, 0.1);
		border-bottom: 1px solid rgba(229, 85, 97, 0.2);
		color: #e55561;
		font-size: 12px;
	}

	.terminal-error button {
		padding: 4px 12px;
		background: rgba(229, 85, 97, 0.2);
		border: 1px solid rgba(229, 85, 97, 0.3);
		border-radius: 4px;
		color: #e55561;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.terminal-error button:hover {
		background: rgba(229, 85, 97, 0.3);
	}

	.terminal-warning {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		background: rgba(226, 184, 107, 0.1);
		border-bottom: 1px solid rgba(226, 184, 107, 0.2);
		color: #e2b86b;
		font-size: 12px;
	}

	.warning-content {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}

	.warning-icon {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.warning-text {
		margin: 0;
		font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
		font-size: 11px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		color: #e2b86b;
	}

	.dismiss-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: #e2b86b;
		opacity: 0.6;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		background: rgba(226, 184, 107, 0.2);
		opacity: 1;
	}

	.terminal-container {
		flex: 1;
		padding: 8px;
		overflow: hidden;
	}

	:global(.terminal-container .xterm) {
		height: 100%;
	}

	:global(.terminal-container .xterm-viewport) {
		overflow-y: auto !important;
	}
</style>
