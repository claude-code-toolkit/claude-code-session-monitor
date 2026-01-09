<script lang="ts">
	import '../app.css';
</script>

<div class="dark bg-carbon-1 min-h-screen text-carbon-12 font-sans">
	<!-- Subtle noise texture on body -->
	<div class="fixed inset-0 opacity-[0.012] bg-noise pointer-events-none"></div>

	<!-- Fixed header bar -->
	<header class="sticky top-0 z-40 border-b border-carbon-6/40 bg-carbon-1/90 backdrop-blur-md">
		<div class="max-w-[2200px] mx-auto px-6 h-11 flex items-center">
			<div class="flex items-center gap-2.5">
				<span class="text-accent-9 font-mono text-sm">❯</span>
				<h1 class="text-sm font-medium text-carbon-12">claude</h1>
				<span class="text-carbon-7 font-mono text-xs">/</span>
				<span class="text-carbon-10 text-sm">sessions</span>
			</div>
		</div>
	</header>

	<!-- Main content area -->
	<main class="relative max-w-[2200px] mx-auto px-6 py-5">
		<slot />
	</main>
</div>
