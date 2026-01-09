<script lang="ts">
	import '../app.css';
	import { maxAgeHours } from '$lib/stores/dismissed';

	let showSettings = false;

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
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="dark bg-carbon-1 min-h-screen text-carbon-12 font-sans">
	<!-- Subtle noise texture on body -->
	<div class="fixed inset-0 opacity-[0.012] bg-noise pointer-events-none"></div>

	<!-- Fixed header bar -->
	<header class="sticky top-0 z-40 border-b border-carbon-6/40 bg-carbon-1/90 backdrop-blur-md">
		<div class="max-w-[2200px] mx-auto px-6 h-11 flex items-center justify-between">
			<div class="flex items-center gap-2.5">
				<span class="text-accent-9 font-mono text-sm">❯</span>
				<h1 class="text-sm font-medium text-carbon-12">claude</h1>
				<span class="text-carbon-7 font-mono text-xs">/</span>
				<span class="text-carbon-10 text-sm">sessions</span>
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
	</header>

	<!-- Main content area -->
	<main class="relative max-w-[2200px] mx-auto px-6 py-5">
		<slot />
	</main>
</div>
