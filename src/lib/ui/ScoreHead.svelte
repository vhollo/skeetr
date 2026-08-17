<script lang="ts">
	import { bandLabel } from '$lib/model/risk';
	import type { RiskPoint } from '$lib/model/types';
	import { bandColour } from './sky';

	interface Props {
		point: RiskPoint | undefined;
		/** Where the risk is heading over the next few hours. */
		trend: 'rising' | 'falling' | 'steady';
		peak: RiskPoint | undefined;
		timezone: string;
	}

	let { point, trend, peak, timezone }: Props = $props();

	let score = $derived(point?.score ?? 0);
	let band = $derived(point?.band ?? 0);

	function time(value: number): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(value);
	}

	// The verdict sentence does the real work — the number alone tells you nothing
	// about whether to act now or in two hours.
	let verdict = $derived.by(() => {
		if (!point) return 'Waiting for a forecast.';
		if (score === 0) {
			return peak && peak.score > 8
				? `Nothing biting now. Picks up to ${peak.score} around ${time(peak.time)}.`
				: 'Nothing biting, and nothing building over the next two days.';
		}
		const direction =
			trend === 'rising' ? 'Rising' : trend === 'falling' ? 'Easing off' : 'Holding steady';
		if (peak && peak.time > point.time && peak.score > score + 4) {
			return `${direction}. Peaks at ${peak.score} around ${time(peak.time)}.`;
		}
		if (peak && peak.time <= point.time) return `${direction} from the peak of ${peak.score}.`;
		return `${direction}.`;
	});
</script>

<div>
	<p class="eyebrow" style="color: {bandColour(band)}">{bandLabel(band)}</p>

	<div class="flex items-baseline gap-3">
		<span
			class="readout display tabular-nums"
			style="font-size: clamp(4.5rem, 22vw, 7.5rem); color: {bandColour(band)}"
			aria-label="Risk score {score} out of 100">{score}</span
		>
		<span class="readout text-sm text-(--color-bone-faint)">/100</span>
	</div>

	<p class="mt-1 max-w-md text-lg leading-snug text-(--color-bone)">{verdict}</p>
</div>
