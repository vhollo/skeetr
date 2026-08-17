<script lang="ts">
	import { goto } from '$app/navigation';
	import type { GeoResult } from '../api/geocode/+server';
	import { places } from '$lib/stores/places.svelte';
	import { currentPosition, loadForecast } from '$lib/stores/forecast.svelte';
	import { assess, protectWindows } from '$lib/model/risk';
	import { prefs } from '$lib/stores/prefs.svelte';
	import { bandLabel } from '$lib/model/risk';
	import { zonedToEpoch } from '$lib/model/time';

	let query = $state('');
	let results = $state<GeoResult[]>([]);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let locating = $state(false);
	let locateError = $state<string | null>(null);

	let debounce: ReturnType<typeof setTimeout>;

	function onInput() {
		clearTimeout(debounce);
		searchError = null;
		if (query.trim().length < 2) {
			results = [];
			return;
		}
		debounce = setTimeout(search, 300);
	}

	async function search() {
		searching = true;
		try {
			const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
			if (!response.ok) throw new Error('Place search is unavailable right now.');
			results = ((await response.json()) as { results: GeoResult[] }).results;
			if (results.length === 0) searchError = `No places found for “${query.trim()}”.`;
		} catch (err) {
			searchError = err instanceof Error ? err.message : 'Place search failed.';
			results = [];
		} finally {
			searching = false;
		}
	}

	function addResult(result: GeoResult) {
		const place = places.add({
			name: result.admin1 ? `${result.name}, ${result.admin1}` : result.name,
			latitude: result.latitude,
			longitude: result.longitude,
			timezone: result.timezone
		});
		places.setActive(place.id);
		query = '';
		results = [];
		goto('/');
	}

	async function useCurrent() {
		locating = true;
		locateError = null;
		try {
			await currentPosition();
			places.setActive('current');
			goto('/');
		} catch (err) {
			locateError = err instanceof Error ? err.message : 'Could not find your location.';
		} finally {
			locating = false;
		}
	}

	// Planned trip
	let tripPlaceId = $state('');
	let tripWhen = $state('');
	let tripHours = $state(3);
	let tripVerdict = $state<string | null>(null);
	let tripBusy = $state(false);

	async function checkTrip() {
		const place = places.saved.find((p) => p.id === tripPlaceId);
		if (!place || !tripWhen) return;

		tripBusy = true;
		tripVerdict = null;
		try {
			// The time typed is local to the destination, not to this device.
			const start = zonedToEpoch(tripWhen, place.timezone);
			if (Number.isNaN(start)) {
				tripVerdict = 'That date could not be read. Pick the time again.';
				return;
			}
			const end = start + tripHours * 3_600_000;
			const forecast = await loadForecast(place.latitude, place.longitude);
			const assessment = assess(forecast, prefs.current.species);

			const during = assessment.points.filter((p) => p.time >= start && p.time < end);
			if (during.length === 0) {
				tripVerdict =
					'That is outside the forecast range. Try a time within the next seven days.';
				return;
			}

			const peak = during.reduce((best, p) => (p.score > best.score ? p : best), during[0]);
			const windows = protectWindows(during);
			const time = new Intl.DateTimeFormat('en-GB', {
				timeZone: place.timezone,
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			}).format(peak.time);

			if (peak.score < 8) {
				tripVerdict = `${bandLabel(peak.band)} throughout — peak of ${peak.score} at ${time}. Leave the spray at home.`;
			} else if (windows.length === 0) {
				tripVerdict = `Peaks at ${peak.score} (${bandLabel(peak.band)}) around ${time}. Noticeable, but not enough to bother covering up for.`;
			} else {
				tripVerdict = `Peaks at ${peak.score} (${bandLabel(peak.band)}) around ${time}. ${windows.length === 1 ? 'One stretch is' : `${windows.length} stretches are`} worth covering — take repellent.`;
			}
		} catch (err) {
			tripVerdict = err instanceof Error ? err.message : 'Could not check that trip.';
		} finally {
			tripBusy = false;
		}
	}

	// The bounds are wall-clock times at the destination, matching how the field is
	// read. Using toISOString here would express them in UTC and reject valid times
	// by up to a whole day at the edges.
	let tripZone = $derived(
		places.saved.find((p) => p.id === tripPlaceId)?.timezone ??
			Intl.DateTimeFormat().resolvedOptions().timeZone
	);

	function wallClock(time: number, timeZone: string): string {
		// sv-SE renders as YYYY-MM-DD HH:mm, which is what the input wants.
		return new Intl.DateTimeFormat('sv-SE', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		})
			.format(time)
			.replace(' ', 'T');
	}

	let minTrip = $derived(wallClock(Date.now() + 60_000, tripZone));
	let maxTrip = $derived(wallClock(Date.now() + 6.5 * 86_400_000, tripZone));
</script>

<svelte:head><title>Places · Skeetr</title></svelte:head>

<header class="pt-6 pb-5">
	<p class="eyebrow">Skeetr</p>
	<h1 class="display mt-0.5 mb-0 text-3xl">Places</h1>
</header>

<section>
	<button
		class="w-full rounded-lg border border-(--color-slate-line) px-4 py-3.5 text-left text-sm transition-colors hover:border-(--color-bone-faint)"
		class:border-welt={places.activeId === 'current'}
		style={places.activeId === 'current' ? 'border-color: var(--color-welt)' : ''}
		onclick={useCurrent}
		disabled={locating}
	>
		<span class="display block text-base text-(--color-bone)"
			>{locating ? 'Finding you…' : 'Use my current location'}</span
		>
		<span class="mt-0.5 block text-xs text-(--color-bone-faint)"
			>Asks the browser for your position each time.</span
		>
	</button>
	{#if locateError}
		<p class="mt-2 text-sm text-(--color-welt-soft)">{locateError}</p>
	{/if}
</section>

<section class="mt-8">
	<label class="eyebrow block" for="place-search">Add a place</label>
	<input
		id="place-search"
		type="search"
		bind:value={query}
		oninput={onInput}
		placeholder="Town, village or city"
		autocomplete="off"
		class="mt-2 w-full rounded-lg border border-(--color-slate-line) bg-(--color-slate-ink) px-4 py-3 text-base text-(--color-bone) placeholder:text-(--color-bone-faint)"
	/>

	{#if searching}
		<p class="mt-2 text-sm text-(--color-bone-faint)">Searching…</p>
	{:else if searchError}
		<p class="mt-2 text-sm text-(--color-bone-dim)">{searchError}</p>
	{/if}

	{#if results.length > 0}
		<ul class="mt-2 list-none space-y-0 p-0">
			{#each results as result (result.id)}
				<li>
					<button
						class="w-full border-t border-(--color-slate-line) px-1 py-3 text-left"
						onclick={() => addResult(result)}
					>
						<span class="block text-(--color-bone)">{result.name}</span>
						<span class="readout block text-xs text-(--color-bone-faint)">
							{[result.admin1, result.country].filter(Boolean).join(' · ')}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if places.saved.length > 0}
	<section class="mt-8">
		<p class="eyebrow">Saved</p>
		<ul class="mt-2 list-none space-y-0 p-0">
			{#each places.saved as place (place.id)}
				<li class="flex items-center gap-2 border-t border-(--color-slate-line)">
					<button
						class="flex-1 py-3.5 text-left"
						onclick={() => {
							places.setActive(place.id);
							goto('/');
						}}
					>
						<span
							class="block text-(--color-bone)"
							style={places.activeId === place.id ? 'color: var(--color-welt-soft)' : ''}
							>{place.name}</span
						>
						<span class="readout block text-xs text-(--color-bone-faint)">
							{place.latitude.toFixed(2)}, {place.longitude.toFixed(2)} · {place.timezone}
						</span>
					</button>
					<button
						class="shrink-0 px-3 py-2 text-sm text-(--color-bone-faint) hover:text-(--color-welt-soft)"
						onclick={() => places.remove(place.id)}
						aria-label="Remove {place.name}">Remove</button
					>
				</li>
			{/each}
		</ul>
	</section>

	<section class="mt-9">
		<p class="eyebrow">Check a planned trip</p>
		<p class="mt-1.5 text-sm text-(--color-bone-dim)">
			Somewhere you will be later — a garden party, a lakeside evening, a camping night.
		</p>

		<div class="mt-3 space-y-3">
			<label class="block">
				<span class="mb-1 block text-xs text-(--color-bone-faint)">Where</span>
				<select
					bind:value={tripPlaceId}
					class="w-full rounded-lg border border-(--color-slate-line) bg-(--color-slate-ink) px-3 py-2.5 text-(--color-bone)"
				>
					<option value="">Pick a saved place</option>
					{#each places.saved as place (place.id)}
						<option value={place.id}>{place.name}</option>
					{/each}
				</select>
			</label>

			<div class="flex gap-3">
				<label class="flex-1">
					<span class="mb-1 block text-xs text-(--color-bone-faint)">When</span>
					<input
						type="datetime-local"
						bind:value={tripWhen}
						min={minTrip}
						max={maxTrip}
						class="w-full rounded-lg border border-(--color-slate-line) bg-(--color-slate-ink) px-3 py-2.5 text-(--color-bone)"
					/>
				</label>
				<label class="w-28">
					<span class="mb-1 block text-xs text-(--color-bone-faint)">Hours</span>
					<input
						type="number"
						bind:value={tripHours}
						min="1"
						max="12"
						class="readout w-full rounded-lg border border-(--color-slate-line) bg-(--color-slate-ink) px-3 py-2.5 text-(--color-bone)"
					/>
				</label>
			</div>

			<button
				class="rounded-lg bg-(--color-welt) px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
				onclick={checkTrip}
				disabled={!tripPlaceId || !tripWhen || tripBusy}
			>
				{tripBusy ? 'Checking…' : 'Check this trip'}
			</button>

			{#if tripVerdict}
				<p class="panel rounded-lg p-4 text-sm leading-relaxed text-(--color-bone)">{tripVerdict}</p>
			{/if}
		</div>
	</section>
{:else}
	<p class="mt-8 text-sm text-(--color-bone-faint)">
		Save a place to compare locations and to check a trip before you go.
	</p>
{/if}
