/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `skeetr-${version}`;
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	// The forecast is worth serving stale: an hour-old risk curve beats a blank
	// screen when the user is standing in a garden with no signal.
	if (url.pathname.startsWith('/api/forecast')) {
		event.respondWith(staleWhileRevalidate(request));
		return;
	}

	if (PRECACHE.includes(url.pathname)) {
		event.respondWith(
			caches.match(request).then((hit) => hit ?? fetch(request))
		);
		return;
	}

	event.respondWith(
		fetch(request).catch(async () => (await caches.match(request)) ?? Response.error())
	);
});

async function staleWhileRevalidate(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);

	const network = fetch(request)
		.then((response) => {
			if (response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => cached ?? Response.error());

	return cached ?? network;
}

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if ('focus' in client) return client.focus();
			}
			return sw.clients.openWindow(target);
		})
	);
});

/**
 * Chromium-only opportunistic wake-up, roughly twice a day. Too coarse to time a
 * dusk warning, but enough to post a morning heads-up when the day ahead looks
 * bad. Everything precise relies on the page being open or on the calendar feed.
 */
sw.addEventListener('periodicsync', ((event: ExtendableEvent & { tag: string }) => {
	if (event.tag !== 'skeetr-risk-check') return;
	event.waitUntil(checkAhead());
}) as EventListener);

async function checkAhead() {
	try {
		const cache = await caches.open(CACHE);
		const stored = await cache.match('/__skeetr_place');
		if (!stored) return;

		const place = (await stored.json()) as { lat: number; lon: number; name: string };
		const response = await fetch(`/api/forecast?lat=${place.lat}&lon=${place.lon}`);
		if (!response.ok) return;

		// The model lives in the app bundle, not here; the worker only needs to know
		// whether anything today crosses the threshold worth interrupting for.
		const forecast = (await response.json()) as {
			hours: { time: number; temperatureC: number; windKmh: number }[];
		};
		const soon = forecast.hours.filter(
			(h) => h.time > Date.now() && h.time < Date.now() + 86_400_000
		);
		const biting = soon.some((h) => h.temperatureC > 15 && h.windKmh < 12);
		if (!biting) return;

		await sw.registration.showNotification('Mosquitoes are likely today', {
			body: `Open Skeetr for tonight's window at ${place.name}.`,
			tag: 'skeetr-daily',
			icon: '/icon-192.png',
			data: { url: '/' }
		});
	} catch {
		// Background work must never throw; a missed check is harmless.
	}
}
