<script lang="ts">
	interface Props {
		name: string;
		detail?: string;
		busy?: boolean;
	}

	let { name, detail, busy = false }: Props = $props();
</script>

<header class="flex items-center justify-between gap-4 pt-6 pb-5">
	<div class="min-w-0">
		<p class="eyebrow">Skeetr</p>
		<a href="/places" class="mt-0.5 flex items-baseline gap-2 no-underline">
			<span class="display truncate text-xl text-(--color-bone)">{name}</span>
			<span aria-hidden="true" class="text-(--color-bone-faint)">›</span>
		</a>
	</div>
	{#if detail}
		<p class="readout shrink-0 text-right text-xs text-(--color-bone-faint)">
			{busy ? 'Updating…' : detail}
		</p>
	{/if}
</header>
