<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { planForWindow, sourceReduction } from '$lib/model/countermeasures';
	import { nextWindow, pointAt } from '$lib/model/risk';
	import type { Forecast, Place } from '$lib/model/types';
	import { places } from '$lib/stores/places.svelte';
	import { prefs } from '$lib/stores/prefs.svelte';
	import {
		currentPosition,
		evaluate,
		loadForecast,
		type LoadedForecast
	} from '$lib/stores/forecast.svelte';
	import { scheduleAlerts } from '$lib/notify/scheduler.svelte';
	import { publishPlaceToWorker } from '$lib/notify/register';
	import ActionList from '$lib/ui/ActionList.svelte';
	import EmergenceCard from '$lib/ui/EmergenceCard.svelte';
	import FactorBars from '$lib/ui/FactorBars.svelte';
	import PlaceBar from '$lib/ui/PlaceBar.svelte';
	import RiskRibbon from '$lib/ui/RiskRibbon.svelte';
	import ScoreHead from '$lib/ui/ScoreHead.svelte';

	let forecast = $state<Forecast | null>(null);
	let place = $state<Place | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(true);

	// A dev-only time override, so a dusk alert can be checked without waiting
	// until dusk: /?now=2026-08-17T19:30
	let now = $state(Date.now());
	let override = $derived.by(() => {
		const raw = page.url.searchParams.get('now');
		if (!raw) return null;
		const parsed = Date.parse(raw);
		return Number.isNaN(parsed) ? null : parsed;
	});

	let result = $state<LoadedForecast | null>(null);
	let hovered = $state<import('$lib/model/types').RiskPoint | null>(null);

	// Recompute whenever the forecast, the clock, or the user's preferences move.
	$effect(() => {
		const effectiveNow = override ?? now;
		// Touch the preferences so a species or setting change re-runs the model.
		void prefs.current.species;
		void prefs.current.setting;
		void prefs.current.minBand;
		result = forecast ? evaluate(forecast, effectiveNow) : null;
	});

	let current = $derived(result ? pointAt(result.upcoming, override ?? now) : undefined);
	let shown = $derived(hovered ?? current);
	let peak = $derived(
		result?.upcoming
			.slice(0, 48)
			.reduce<(typeof result.upcoming)[number] | undefined>(
				(best, p) => (!best || p.score > best.score ? p : best),
				undefined
			)
	);

	let trend = $derived.by((): 'rising' | 'falling' | 'steady' => {
		if (!result || !current) return 'steady';
		const index = result.upcoming.indexOf(current);
		const ahead = result.upcoming[index + 2];
		if (!ahead) return 'steady';
		if (ahead.score > current.score + 4) return 'rising';
		if (ahead.score < current.score - 4) return 'falling';
		return 'steady';
	});

	let window_ = $derived(result ? nextWindow(result.windows, override ?? now) : undefined);
	let actions = $derived(
		result && window_ ? planForWindow(window_, result.upcoming, prefs.current.setting) : []
	);

	// A plan is only worth putting in front of someone if it is close enough to
	// act on. Anything further out is reported as a heads-up instead.
	const ACTIONABLE_HORIZON_MS = 18 * 3_600_000;
	let imminent = $derived(!!window_ && window_.start - (override ?? now) <= ACTIONABLE_HORIZON_MS);

	function whenLabel(time: number): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			weekday: 'long',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(time);
	}
	let cohorts = $derived(result?.assessment.cohorts ?? []);
	let advice = $derived(result ? sourceReduction(cohorts, override ?? now) : null);

	async function load() {
		busy = true;
		error = null;
		try {
			const saved = places.saved.find((p) => p.id === places.activeId);
			if (saved) {
				place = saved;
				forecast = await loadForecast(saved.latitude, saved.longitude);
			} else {
				const position = await currentPosition();
				forecast = await loadForecast(position.latitude, position.longitude);
				place = {
					id: 'current',
					name: 'Current location',
					latitude: position.latitude,
					longitude: position.longitude,
					timezone: forecast.timezone
				};
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong loading the forecast.';
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		load();
		const tick = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(tick);
	});

	// Keep the in-page notification timers in step with the current plan.
	$effect(() => {
		if (!browser || !result || !prefs.current.notificationsEnabled) return;
		return scheduleAlerts(result.alerts);
	});

	// The service worker cannot read localStorage, so hand it the active place for
	// its twice-daily background check.
	$effect(() => {
		if (!browser || !place) return;
		publishPlaceToWorker(place);
	});

	let timezone = $derived(forecast?.timezone ?? 'UTC');
	let updated = $derived(
		forecast
			? new Intl.DateTimeFormat('en-GB', {
					timeZone: timezone,
					hour: '2-digit',
					minute: '2-digit',
					hour12: false
				}).format(forecast.fetchedAt)
			: ''
	);
</script>

<svelte:head>
	<title>{current ? `${current.score} · ` : ''}Skeetr</title>
</svelte:head>

<PlaceBar name={place?.name ?? 'Finding you…'} detail={updated ? `Updated ${updated}` : ''} {busy} />

{#if error}
	<div class="panel rounded-lg p-5">
		<p class="display m-0 text-lg">Could not load a forecast</p>
		<p class="mt-2 text-sm text-(--color-bone-dim)">{error}</p>
		<div class="mt-4 flex gap-3">
			<button
				class="rounded-md border border-(--color-slate-line) px-4 py-2 text-sm text-(--color-bone)"
				onclick={load}>Try again</button
			>
			<a
				href="/places"
				class="rounded-md bg-(--color-welt) px-4 py-2 text-sm font-medium text-white no-underline"
				>Add a place by name</a
			>
		</div>
	</div>
{:else if !result || !current}
	<div class="panel animate-pulse rounded-lg p-5">
		<p class="text-sm text-(--color-bone-dim)">Reading the weather and working out the model…</p>
	</div>
{:else}
	<ScoreHead point={shown} {trend} {peak} {timezone} />

	<section class="mt-7">
		<div class="mb-2 flex items-baseline justify-between">
			<p class="eyebrow">Next 48 hours</p>
			<p class="readout text-xs text-(--color-bone-faint)">
				{hovered ? 'reading the chart' : 'shaded by daylight'}
			</p>
		</div>
		<RiskRibbon
			points={result.upcoming}
			days={forecast?.days ?? []}
			windows={result.windows}
			{timezone}
			now={override ?? now}
			onhover={(point) => (hovered = point)}
		/>
	</section>

	{#if window_ && actions.length > 0 && imminent}
		<section class="mt-8">
			<p class="eyebrow">
				{window_.start <= (override ?? now) ? 'Do this now' : 'Before it starts'}
			</p>
			<div class="mt-1">
				<ActionList
					{actions}
					exposureStart={window_.start}
					{timezone}
					now={override ?? now}
				/>
			</div>
		</section>
	{:else if window_ && actions.length > 0}
		<section class="mt-8">
			<p class="eyebrow">Next worth covering</p>
			<p class="mt-2 text-lg leading-snug text-(--color-bone)">
				{whenLabel(window_.start)}, peaking at {window_.peakScore}.
			</p>
			<p class="mt-1.5 text-sm text-(--color-bone-dim)">
				Nothing to do until then. The plan appears here on the day.
			</p>
		</section>
	{:else}
		<section class="mt-8">
			<p class="eyebrow">Nothing to do</p>
			<p class="mt-2 text-sm text-(--color-bone-dim)">
				No window over the next few days reaches the level you have set for advice. Sit outside.
			</p>
		</section>
	{/if}

	{#if shown}
		<section class="mt-9">
			<div class="mb-3 flex items-baseline justify-between">
				<p class="eyebrow">Why</p>
				{#if hovered}
					<p class="readout text-xs text-(--color-welt-soft)">
						{new Intl.DateTimeFormat('en-GB', {
							timeZone: timezone,
							hour: '2-digit',
							minute: '2-digit',
							hour12: false
						}).format(hovered.time)}
					</p>
				{/if}
			</div>
			<FactorBars point={shown} />
		</section>
	{/if}

	<section class="mt-9">
		<EmergenceCard {advice} {cohorts} now={override ?? now} {timezone} />
	</section>

	<p class="mt-10 text-xs leading-relaxed text-(--color-bone-faint)">
		An estimate from weather data, not a measurement. <a href="/model" class="underline"
			>How it works</a
		>. Weather by Open-Meteo.
	</p>
{/if}
