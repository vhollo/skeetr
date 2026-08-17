import { browser } from '$app/environment';

/**
 * Registers the service worker and, where the browser allows it, asks for the
 * opportunistic background wake-up. Both are best-effort: the app is fully
 * usable without either.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!browser || !('serviceWorker' in navigator)) return null;

	try {
		const registration = await navigator.serviceWorker.register('/service-worker.js', {
			type: 'module'
		});
		return registration;
	} catch {
		return null;
	}
}

/** Chromium only, installed PWAs only, and gated on how often the app is used. */
export async function requestBackgroundChecks(
	registration: ServiceWorkerRegistration | null
): Promise<boolean> {
	if (!registration?.periodicSync) return false;

	try {
		const status = await navigator.permissions.query({
			name: 'periodic-background-sync' as PermissionName
		});
		if (status.state !== 'granted') return false;

		await registration.periodicSync.register('skeeter-risk-check', {
			// The floor the browser enforces is around 12 hours regardless.
			minInterval: 12 * 60 * 60 * 1000
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Stashes the active place where the service worker can reach it, since the
 * worker cannot read localStorage.
 */
export async function publishPlaceToWorker(place: {
	latitude: number;
	longitude: number;
	name: string;
}): Promise<void> {
	if (!browser || !('caches' in window)) return;
	try {
		const keys = await caches.keys();
		const key = keys.find((k) => k.startsWith('skeeter-'));
		if (!key) return;
		const cache = await caches.open(key);
		await cache.put(
			'/__skeeter_place',
			new Response(
				JSON.stringify({ lat: place.latitude, lon: place.longitude, name: place.name }),
				{ headers: { 'content-type': 'application/json' } }
			)
		);
	} catch {
		// Without this the background check simply does not run.
	}
}
