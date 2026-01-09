<script lang="ts">
	import '../app.css';
</script>

<div class="dark bg-slate-1 min-h-screen text-slate-12">
	<div class="max-w-[1800px] mx-auto px-5 py-5">
		<div class="flex flex-col gap-5">
			<!-- Header -->
			<div class="flex items-center gap-3">
				<h1 class="font-heading text-3xl font-bold">Sessions</h1>
				<span class="text-sm text-slate-11 mt-1">Claude Code</span>
			</div>

			<!-- Page content -->
			<slot />
		</div>
	</div>
</div>
