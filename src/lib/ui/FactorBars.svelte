<script lang="ts">
	import { formatTemp, formatWind, prefs } from '$lib/stores/prefs.svelte';
	import type { RiskPoint } from '$lib/model/types';

	interface Props {
		point: RiskPoint;
	}

	let { point }: Props = $props();
	let units = $derived(prefs.current.units);

	// Each row pairs the multiplier with the reading that produced it, so the user
	// can check the model's reasoning against what they can feel outside.
	let rows = $derived([
		{
			label: 'Temperature',
			value: point.activity.temperature,
			reading: formatTemp(point.weather.temperatureC, units)
		},
		{ label: 'Wind', value: point.activity.wind, reading: formatWind(point.weather.windKmh, units) },
		{
			label: 'Humidity',
			value: point.activity.humidity,
			reading: `${Math.round(point.weather.humidityPct)}%`
		},
		{
			label: 'Rain',
			value: point.activity.rain,
			reading:
				point.weather.precipitationMm > 0 ? `${point.weather.precipitationMm.toFixed(1)} mm` : 'dry'
		},
		{ label: 'Time of day', value: point.activity.diel, reading: '' }
	]);

	function limiting(): string {
		const weakest = rows.reduce((min, row) => (row.value < min.value ? row : min), rows[0]);
		if (weakest.value > 0.75) return 'Nothing is holding them back.';
		return `${weakest.label.toLowerCase()} is what is keeping this down.`;
	}
</script>

<div>
	<div class="space-y-2.5">
		{#each rows as row (row.label)}
			<div class="flex items-center gap-3">
				<span class="w-28 shrink-0 text-sm text-(--color-bone-dim)">{row.label}</span>
				<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-slate-ink)">
					<div
						class="h-full rounded-full bg-(--color-welt) transition-[width] duration-500"
						style="width: {Math.round(row.value * 100)}%"
					></div>
				</div>
				<span class="readout w-14 shrink-0 text-right text-xs text-(--color-bone-faint)"
					>{row.reading}</span
				>
			</div>
		{/each}
	</div>

	<div class="mt-4 flex items-center gap-3 border-t border-(--color-slate-line) pt-3">
		<span class="w-28 shrink-0 text-sm text-(--color-bone-dim)">How many about</span>
		<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-slate-ink)">
			<div
				class="h-full rounded-full bg-(--color-welt-soft)"
				style="width: {Math.round(point.population * 100)}%"
			></div>
		</div>
		<span class="readout w-14 shrink-0 text-right text-xs text-(--color-bone-faint)"
			>{Math.round(point.population * 100)}%</span
		>
	</div>

	<p class="mt-3 text-sm text-(--color-bone-faint)">{limiting()}</p>
</div>
