<script lang="ts">
	import { progressAt } from '$lib/model/cohorts';
	import type { SourceReductionAdvice } from '$lib/model/countermeasures';
	import type { Cohort } from '$lib/model/types';

	interface Props {
		advice: SourceReductionAdvice | null;
		cohorts: Cohort[];
		now: number;
		timezone: string;
	}

	let { advice, cohorts, now, timezone }: Props = $props();

	// Only rain-seeded batches are worth showing; the background trickle from
	// permanent habitat is not something anyone can act on.
	let batches = $derived(
		cohorts
			.filter((c) => c.rainMm >= 5 && c.startedAt <= now)
			.map((c) => ({ ...c, at: progressAt(c, now) }))
			.filter((c) => c.at > 0.02 && c.at < 1)
			.sort((a, b) => b.at - a.at)
			.slice(0, 4)
	);

	function date(value: number): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			day: 'numeric',
			month: 'short'
		}).format(value);
	}
</script>

{#if advice}
	<div class="panel rounded-lg p-5">
		<p class="eyebrow">Coming up</p>
		<h2 class="display mt-1.5 mb-0 text-2xl">{advice.title}</h2>
		<p class="mt-2 text-sm leading-relaxed text-(--color-bone-dim)">{advice.detail}</p>
		{#if advice.because}
			<p class="readout mt-3 text-xs text-(--color-welt-soft)">{advice.because}</p>
		{/if}
	</div>
{/if}

{#if batches.length > 0}
	<div class="mt-4">
		<p class="eyebrow">Batches in the water</p>
		<ul class="mt-3 list-none space-y-3 p-0">
			{#each batches as batch (batch.startedAt)}
				<li>
					<div class="flex items-baseline justify-between gap-3 text-sm">
						<span class="text-(--color-bone-dim)">
							{batch.rainMm.toFixed(0)} mm on {date(batch.startedAt)}
						</span>
						<span class="readout text-xs text-(--color-bone-faint)">
							{Math.round(batch.at * 100)}% grown
						</span>
					</div>
					<div class="mt-1.5 h-1 overflow-hidden rounded-full bg-(--color-slate-ink)">
						<div
							class="h-full rounded-full bg-(--color-band-2)"
							style="width: {Math.round(batch.at * 100)}%"
						></div>
					</div>
				</li>
			{/each}
		</ul>
		<p class="mt-3 text-xs leading-relaxed text-(--color-bone-faint)">
			Eggs flooded by rain become biting adults once enough warmth has built up. Warm weather brings
			that forward; a cold spell pushes it back.
		</p>
	</div>
{/if}
