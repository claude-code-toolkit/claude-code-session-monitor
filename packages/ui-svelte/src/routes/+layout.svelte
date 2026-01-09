<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { maxAgeHours } from '$lib/stores/dismissed';
	import { getMachinesStore, requestNotificationPermission, type NotifyMode } from '$lib/stores/sessions';
	import { terminalPanel, openLauncher } from '$lib/stores/terminals';
	import TerminalPanel from '$lib/components/TerminalPanel.svelte';

	// State for new terminal button
	let creatingLauncher = false;

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

	const machines = getMachinesStore();
	let showSettings = false;
	let showNotifySettings = false;
	let notificationPermission: NotificationPermission = 'default';

	// Notification preferences (stored in localStorage)
	let notifyMode: NotifyMode = (typeof localStorage !== 'undefined'
		? localStorage.getItem('notifyMode') as NotifyMode
		: null) || 'all';

	// Check notification permission on mount
	onMount(() => {
		if ('Notification' in window) {
			notificationPermission = Notification.permission;
		}
	});

	async function handleEnableNotifications() {
		const granted = await requestNotificationPermission();
		notificationPermission = granted ? 'granted' : 'denied';
	}

	function setNotifyMode(mode: NotifyMode) {
		notifyMode = mode;
		localStorage.setItem('notifyMode', mode);
		showNotifySettings = false;
	}

	function handleNotifyClick() {
		if (notificationPermission !== 'granted') {
			handleEnableNotifications();
		} else {
			showNotifySettings = !showNotifySettings;
		}
	}

	const ageOptions = [
		{ label: '6 hours', value: 6 },
		{ label: '12 hours', value: 12 },
		{ label: '24 hours', value: 24 },
		{ label: '48 hours', value: 48 },
		{ label: '7 days', value: 168 },
		{ label: 'All', value: 8760 }, // 1 year
	];

	function handleAgeSelect(hours: number) {
		maxAgeHours.setMaxAge(hours);
		showSettings = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.settings-dropdown')) {
			showSettings = false;
		}
		if (!target.closest('.notify-dropdown')) {
			showNotifySettings = false;
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="dark bg-carbon-1 min-h-screen text-carbon-12 font-sans">
	<!-- Subtle noise texture on body -->
	<div class="fixed inset-0 opacity-[0.012] bg-noise pointer-events-none"></div>

	<!-- Fixed header bar -->
	<header class="sticky top-0 z-40 border-b border-carbon-6/40 bg-carbon-1/90 backdrop-blur-md">
		<div class="relative px-6 h-11 flex items-center justify-between">
			<!-- Left: branding -->
			<div class="flex items-center gap-2.5">
				<span class="text-accent-9 font-mono text-sm">❯</span>
				<h1 class="text-sm font-medium text-carbon-12">claude</h1>
				<span class="text-carbon-7 font-mono text-xs">/</span>
				<span class="text-carbon-10 text-sm">sessions</span>
			</div>

			<!-- Center: Machine status (absolutely centered) -->
			{#if $machines.length > 0}
				<div class="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
					{#each $machines as machine}
						<div
							class="flex items-center gap-1.5 text-2xs font-mono"
							title="{machine.name}: {machine.status}{machine.error ? ` - ${machine.error}` : ''}"
						>
							<span
								class="w-1.5 h-1.5 rounded-full"
								class:bg-active-9={machine.status === 'mounted'}
								class:bg-pending-9={machine.status === 'mounting'}
								class:bg-error-9={machine.status === 'error' || machine.status === 'unmounted'}
							></span>
							<span
								class:text-carbon-11={machine.status === 'mounted'}
								class:text-carbon-8={machine.status !== 'mounted'}
							>
								{machine.name}
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Right: controls -->
			<div class="flex items-center gap-1">
				<!-- Notification settings -->
			<div class="notify-dropdown relative">
				<button
					class="flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono rounded transition-colors
						{notificationPermission === 'denied' ? 'text-carbon-7' : notificationPermission === 'granted' && notifyMode !== 'none' ? 'text-accent-9 hover:text-accent-10 hover:bg-carbon-4' : 'text-carbon-9 hover:text-carbon-11 hover:bg-carbon-4'}"
					on:click|stopPropagation={handleNotifyClick}
					title={notificationPermission === 'denied' ? 'Notifications blocked - enable in browser settings' : notificationPermission !== 'granted' ? 'Enable notifications' : 'Notification settings'}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
						{#if notificationPermission === 'granted' && notifyMode === 'none'}
							<path d="M3 3l18 18" stroke-linecap="round"/>
						{/if}
					</svg>
				</button>

				{#if showNotifySettings && notificationPermission === 'granted'}
					<div class="absolute right-0 top-full mt-1 w-44 bg-carbon-2 border border-carbon-6/60
						rounded-lg shadow-lg overflow-hidden animate-fade-in z-50">
						<div class="px-3 py-2 border-b border-carbon-6/40">
							<p class="text-2xs font-mono text-carbon-8 uppercase tracking-wide">Notify me when</p>
						</div>
						<button
							class="w-full px-3 py-2 text-left text-xs font-mono hover:bg-carbon-4 transition-colors
								{notifyMode === 'all' ? 'text-accent-10 bg-carbon-3' : 'text-carbon-11'}"
							on:click|stopPropagation={() => setNotifyMode('all')}
						>
							All status changes
							{#if notifyMode === 'all'}<span class="float-right text-accent-9">✓</span>{/if}
						</button>
						<button
							class="w-full px-3 py-2 text-left text-xs font-mono hover:bg-carbon-4 transition-colors
								{notifyMode === 'approval_only' ? 'text-accent-10 bg-carbon-3' : 'text-carbon-11'}"
							on:click|stopPropagation={() => setNotifyMode('approval_only')}
						>
							Needs approval only
							{#if notifyMode === 'approval_only'}<span class="float-right text-accent-9">✓</span>{/if}
						</button>
						<button
							class="w-full px-3 py-2 text-left text-xs font-mono hover:bg-carbon-4 transition-colors
								{notifyMode === 'none' ? 'text-accent-10 bg-carbon-3' : 'text-carbon-11'}"
							on:click|stopPropagation={() => setNotifyMode('none')}
						>
							Disabled
							{#if notifyMode === 'none'}<span class="float-right text-accent-9">✓</span>{/if}
						</button>
					</div>
				{/if}
			</div>

			<!-- Settings dropdown -->
			<div class="settings-dropdown relative">
				<button
					class="flex items-center gap-2 px-2.5 py-1.5 text-xs font-mono text-carbon-9 hover:text-carbon-11
						hover:bg-carbon-4 rounded transition-colors"
					on:click|stopPropagation={() => showSettings = !showSettings}
				>
					<span class="text-carbon-8">≡</span>
					<span class="tabular-nums">{$maxAgeHours}h</span>
				</button>

				{#if showSettings}
					<div class="absolute right-0 top-full mt-1 w-36 bg-carbon-2 border border-carbon-6/60
						rounded-lg shadow-lg overflow-hidden animate-fade-in z-50">
						<div class="px-3 py-2 border-b border-carbon-6/40">
							<p class="text-2xs font-mono text-carbon-8 uppercase tracking-wide">Show idle from</p>
						</div>
						{#each ageOptions as option}
							<button
								class="w-full px-3 py-2 text-left text-xs font-mono hover:bg-carbon-4 transition-colors
									{$maxAgeHours === option.value ? 'text-accent-10 bg-carbon-3' : 'text-carbon-11'}"
								on:click|stopPropagation={() => handleAgeSelect(option.value)}
							>
								{option.label}
								{#if $maxAgeHours === option.value}
									<span class="float-right text-accent-9">✓</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			</div>
		</div>
	</header>

	<!-- Main content area -->
	<main
		class="relative max-w-[2200px] mx-auto px-6 py-5 transition-all duration-200"
		style={$terminalPanel ? 'margin-right: 600px;' : ''}
	>
		<slot />
	</main>

	<!-- Terminal panel (slides in from right) -->
	<TerminalPanel />

	<!-- Floating New Terminal button -->
	<button
		class="fixed bottom-6 right-6 z-30 flex items-center justify-center w-12 h-12
			bg-carbon-3 hover:bg-carbon-4 border border-carbon-6/60 rounded-full
			text-carbon-9 hover:text-accent-10 shadow-lg transition-all
			disabled:opacity-50 disabled:cursor-not-allowed"
		class:right-[624px]={$terminalPanel}
		on:click={handleNewTerminal}
		disabled={creatingLauncher}
		title="New terminal session"
	>
		<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
			<path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
		</svg>
	</button>
</div>
