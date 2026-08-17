<script lang="ts">
	import { startTimeFor, type TimedAction } from '$lib/model/countermeasures';

	interface Props {
		actions: TimedAction[];
		/** When the risk window opens. Actions are scheduled backwards from here. */
		exposureStart: number;
		timezone: string;
		now?: number;
	}

	let { actions, exposureStart, timezone, now = Date.now() }: Props = $props();

	function time(value: number): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(value);
	}

	function countdown(target: number): string {
		const minutes = Math.round((target - now) / 60_000);
		if (minutes <= 0) return 'now';
		if (minutes < 60) return `in ${minutes} min`;

		const hours = Math.floor(minutes / 60);
		// Past a day, minute precision is noise — "in 60 h 52 min" reads as urgent
		// when the thing is two and a half days away.
		if (hours >= 24) {
			const days = Math.round(hours / 24);
			return days === 1 ? 'tomorrow' : `in ${days} days`;
		}

		const rest = minutes % 60;
		return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
	}

	function duration(minutes: number): string {
		if (minutes === 0) return 'while it runs';
		if (minutes < 60) return `${minutes} min`;
		return `about ${Math.round(minutes / 60)} h`;
	}
</script>

{#if actions.length > 0}
	<ol class="m-0 list-none space-y-0 p-0">
		{#each actions as action (action.id)}
			{@const at = startTimeFor(action, exposureStart)}
			<li class="border-t border-(--color-slate-line) py-4 first:border-t-0">
				<div class="flex items-baseline justify-between gap-4">
					<h3 class="display m-0 text-lg text-(--color-bone)">{action.title}</h3>
					<span class="readout shrink-0 text-sm text-(--color-welt-soft)">{time(at)}</span>
				</div>

				<p class="readout mt-0.5 text-xs text-(--color-bone-faint)">
					{countdown(at)}
					{#if action.leadMinutes > 0}
						· {action.leadMinutes} min before it starts
					{/if}
					· lasts {duration(action.durationMinutes)}
				</p>

				<p class="mt-2 text-sm leading-relaxed text-(--color-bone-dim)">{action.detail}</p>

				{#if action.because}
					<p class="mt-2 border-l-2 border-(--color-slate-line) pl-3 text-sm text-(--color-bone-faint)">
						{action.because}
					</p>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
