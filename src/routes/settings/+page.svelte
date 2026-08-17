<script lang="ts">
	import { onMount } from 'svelte';
	import { PROFILES } from '$lib/model/species';
	import { BANDS } from '$lib/model/params';
	import { prefs } from '$lib/stores/prefs.svelte';
	import { places } from '$lib/stores/places.svelte';
	import { detect, requestPermission, type Capability } from '$lib/notify/capability';
	import { sendTestNotification } from '$lib/notify/scheduler.svelte';

	let capability = $state<Capability | null>(null);
	let testSent = $state(false);
	let permissionNote = $state<string | null>(null);

	onMount(async () => {
		capability = await detect();
	});

	async function enableNotifications() {
		const result = await requestPermission();
		capability = await detect();

		if (result === 'granted') {
			prefs.update({ notificationsEnabled: true });
			permissionNote = null;
		} else if (result === 'denied') {
			prefs.update({ notificationsEnabled: false });
			permissionNote =
				'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.';
		}
	}

	async function test() {
		testSent = await sendTestNotification();
	}

	// The calendar feed is the only path that survives the app being closed, so it
	// gets a real place in the UI rather than being buried as an extra.
	let activePlace = $derived(places.saved.find((p) => p.id === places.activeId));
	let feedUrl = $derived.by(() => {
		if (!activePlace) return null;
		const params = new URLSearchParams({
			lat: String(activePlace.latitude),
			lon: String(activePlace.longitude),
			name: activePlace.name,
			species: prefs.current.species,
			setting: prefs.current.setting,
			minBand: String(prefs.current.minBand)
		});
		return `/api/ics?${params}`;
	});
	let webcalUrl = $derived.by(() => {
		if (!feedUrl || typeof location === 'undefined') return null;
		return `webcal://${location.host}${feedUrl}`;
	});

	let quietOn = $derived(prefs.current.quietHours !== null);
</script>

<svelte:head><title>Settings · Skeeter</title></svelte:head>

<header class="pt-6 pb-5">
	<p class="eyebrow">Skeeter</p>
	<h1 class="display mt-0.5 mb-0 text-3xl">Settings</h1>
</header>

<section>
	<p class="eyebrow">Where you will be</p>
	<div class="mt-2 grid grid-cols-2 gap-2">
		{#each [{ id: 'outdoor', label: 'Outdoors', hint: 'Terrace, garden, camping' }, { id: 'indoor', label: 'Indoors', hint: 'Windows open, room to protect' }] as option (option.id)}
			<button
				class="rounded-lg border px-4 py-3 text-left"
				style={prefs.current.setting === option.id
					? 'border-color: var(--color-welt); background: color-mix(in oklab, var(--color-welt) 12%, transparent)'
					: 'border-color: var(--color-slate-line)'}
				onclick={() => prefs.update({ setting: option.id as 'indoor' | 'outdoor' })}
			>
				<span class="display block text-base">{option.label}</span>
				<span class="mt-0.5 block text-xs text-(--color-bone-faint)">{option.hint}</span>
			</button>
		{/each}
	</div>
</section>

<section class="mt-8">
	<p class="eyebrow">Which mosquito</p>
	<div class="mt-2 space-y-2">
		<button
			class="w-full rounded-lg border px-4 py-3 text-left"
			style={prefs.current.species === 'auto'
				? 'border-color: var(--color-welt)'
				: 'border-color: var(--color-slate-line)'}
			onclick={() => prefs.update({ species: 'auto' })}
		>
			<span class="display block text-base">Decide for me</span>
			<span class="mt-0.5 block text-xs text-(--color-bone-faint)"
				>Picks from your latitude. Right for most people.</span
			>
		</button>
		{#each Object.values(PROFILES) as profile (profile.id)}
			<button
				class="w-full rounded-lg border px-4 py-3 text-left"
				style={prefs.current.species === profile.id
					? 'border-color: var(--color-welt)'
					: 'border-color: var(--color-slate-line)'}
				onclick={() => prefs.update({ species: profile.id })}
			>
				<span class="display block text-base">{profile.label}</span>
				<span class="mt-1 block text-xs leading-relaxed text-(--color-bone-faint)"
					>{profile.blurb}</span
				>
			</button>
		{/each}
	</div>
</section>

<section class="mt-8">
	<p class="eyebrow">Warn me from</p>
	<div class="mt-2 flex gap-2">
		{#each BANDS.filter((b) => b.id >= 1) as band (band.id)}
			<button
				class="flex-1 rounded-lg border px-2 py-2.5 text-center text-sm"
				style={prefs.current.minBand === band.id
					? 'border-color: var(--color-welt); color: var(--color-welt-soft)'
					: 'border-color: var(--color-slate-line); color: var(--color-bone-dim)'}
				onclick={() => prefs.update({ minBand: band.id })}
			>
				{band.label}
			</button>
		{/each}
	</div>
	<p class="mt-2 text-xs text-(--color-bone-faint)">
		Windows below this level are still drawn on the chart — they just do not raise an alert.
	</p>
</section>

<section class="mt-9">
	<p class="eyebrow">Alerts</p>

	{#if capability}
		<p class="mt-2 text-sm leading-relaxed text-(--color-bone-dim)">{capability.summary}</p>

		<dl class="readout mt-3 space-y-1 text-xs text-(--color-bone-faint)">
			<div class="flex justify-between">
				<dt>Installed to home screen</dt>
				<dd>{capability.installed ? 'yes' : 'no'}</dd>
			</div>
			<div class="flex justify-between">
				<dt>Background wake-ups</dt>
				<dd>{capability.periodicSync ? 'available' : 'not available'}</dd>
			</div>
			<div class="flex justify-between">
				<dt>Permission</dt>
				<dd>{capability.permission}</dd>
			</div>
		</dl>

		<div class="mt-4 flex flex-wrap gap-3">
			{#if capability.canNotify && capability.permission !== 'granted'}
				<button
					class="rounded-lg bg-(--color-welt) px-4 py-2.5 text-sm font-medium text-white"
					onclick={enableNotifications}>Turn on alerts</button
				>
			{:else if capability.permission === 'granted'}
				<button
					class="rounded-lg border border-(--color-slate-line) px-4 py-2.5 text-sm"
					onclick={test}>Send a test alert</button
				>
				<button
					class="rounded-lg border border-(--color-slate-line) px-4 py-2.5 text-sm text-(--color-bone-dim)"
					onclick={() =>
						prefs.update({ notificationsEnabled: !prefs.current.notificationsEnabled })}
				>
					{prefs.current.notificationsEnabled ? 'Pause alerts' : 'Resume alerts'}
				</button>
			{/if}
		</div>

		{#if testSent}
			<p class="mt-2 text-sm text-(--color-bone-dim)">Sent. It should appear now.</p>
		{/if}
		{#if permissionNote}
			<p class="mt-2 text-sm text-(--color-welt-soft)">{permissionNote}</p>
		{/if}
	{/if}
</section>

<section class="mt-8">
	<p class="eyebrow">Quiet hours</p>
	<label class="mt-2 flex items-center gap-3">
		<input
			type="checkbox"
			checked={quietOn}
			onchange={(event) =>
				prefs.update({
					quietHours: event.currentTarget.checked ? { start: 23, end: 7 } : null
				})}
		/>
		<span class="text-sm text-(--color-bone-dim)">Hold alerts overnight</span>
	</label>
	{#if prefs.current.quietHours}
		<div class="readout mt-2 flex items-center gap-2 text-sm text-(--color-bone-dim)">
			<input
				type="number"
				min="0"
				max="23"
				value={prefs.current.quietHours.start}
				onchange={(event) =>
					prefs.update({
						quietHours: { ...prefs.current.quietHours!, start: Number(event.currentTarget.value) }
					})}
				class="w-16 rounded border border-(--color-slate-line) bg-(--color-slate-ink) px-2 py-1"
			/>
			<span>to</span>
			<input
				type="number"
				min="0"
				max="23"
				value={prefs.current.quietHours.end}
				onchange={(event) =>
					prefs.update({
						quietHours: { ...prefs.current.quietHours!, end: Number(event.currentTarget.value) }
					})}
				class="w-16 rounded border border-(--color-slate-line) bg-(--color-slate-ink) px-2 py-1"
			/>
		</div>
	{/if}
</section>

<section class="mt-9">
	<p class="eyebrow">Calendar</p>
	<p class="mt-2 text-sm leading-relaxed text-(--color-bone-dim)">
		Subscribing puts each protect window in your calendar with an alarm set to the lead time. Your
		phone fires it whether or not this app is running — on iPhone this is the only way to be warned
		with the app closed.
	</p>

	{#if feedUrl && webcalUrl}
		<div class="mt-3 flex flex-wrap gap-3">
			<a
				href={webcalUrl}
				class="rounded-lg bg-(--color-welt) px-4 py-2.5 text-sm font-medium text-white no-underline"
				>Subscribe in Calendar</a
			>
			<a
				href={feedUrl}
				download
				class="rounded-lg border border-(--color-slate-line) px-4 py-2.5 text-sm text-(--color-bone) no-underline"
				>Download the next 7 days</a
			>
		</div>
		<p class="mt-2 text-xs text-(--color-bone-faint)">Feed for {activePlace?.name}.</p>
	{:else}
		<p class="mt-2 text-sm text-(--color-bone-faint)">
			Save a place first — the calendar feed needs a fixed location, not a moving one.
		</p>
	{/if}
</section>

<section class="mt-9">
	<p class="eyebrow">Units</p>
	<div class="mt-2 flex gap-2">
		{#each [{ id: 'metric', label: '°C · km/h' }, { id: 'imperial', label: '°F · mph' }] as option (option.id)}
			<button
				class="readout flex-1 rounded-lg border px-3 py-2.5 text-sm"
				style={prefs.current.units === option.id
					? 'border-color: var(--color-welt); color: var(--color-welt-soft)'
					: 'border-color: var(--color-slate-line); color: var(--color-bone-dim)'}
				onclick={() => prefs.update({ units: option.id as 'metric' | 'imperial' })}
			>
				{option.label}
			</button>
		{/each}
	</div>
</section>
