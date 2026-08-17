import { browser } from '$app/environment';
import type { Alert } from '$lib/model/schedule';

/**
 * Fires alerts from the page itself with plain timers.
 *
 * There is no client-side scheduled-notification API — Notification Triggers
 * never shipped past its origin trial — so this only works while the page is
 * alive. That limitation is surfaced honestly in Settings rather than hidden.
 */

const FIRED_KEY = 'skeetr:fired';
/** setTimeout is unreliable beyond this; longer-range alerts are re-armed on load. */
const MAX_DELAY_MS = 30 * 60 * 1000;

function fired(): Set<string> {
	if (!browser) return new Set();
	try {
		return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[]);
	} catch {
		return new Set();
	}
}

function markFired(id: string) {
	if (!browser) return;
	const all = fired();
	all.add(id);
	// Keep the list from growing without bound across a season.
	const trimmed = [...all].slice(-100);
	try {
		localStorage.setItem(FIRED_KEY, JSON.stringify(trimmed));
	} catch {
		/* storage full or unavailable; a repeat notification is the worst case */
	}
}

async function show(alert: Alert) {
	if (!browser || Notification.permission !== 'granted') return;

	try {
		const registration = await navigator.serviceWorker.ready;
		await registration.showNotification(alert.title, {
			body: alert.body,
			tag: alert.id,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			// A dusk warning is worth interrupting for; the user chose to enable this.
			requireInteraction: false,
			data: { url: '/' }
		});
		markFired(alert.id);
	} catch {
		// No service worker (or it failed to register) — fall back to a page notification.
		try {
			new Notification(alert.title, { body: alert.body, tag: alert.id });
			markFired(alert.id);
		} catch {
			/* nothing more we can do from here */
		}
	}
}

/**
 * Arms timers for any alert due within the next half hour.
 * Returns a cleanup function; call it whenever the plan is recomputed.
 */
export function scheduleAlerts(alerts: Alert[]): () => void {
	if (!browser) return () => {};

	const already = fired();
	const timers: ReturnType<typeof setTimeout>[] = [];
	const now = Date.now();

	for (const alert of alerts) {
		if (already.has(alert.id)) continue;

		const delay = alert.fireAt - now;
		if (delay < -60_000) continue; // long past; do not fire stale alerts
		if (delay > MAX_DELAY_MS) continue; // re-armed on the next recompute

		timers.push(setTimeout(() => show(alert), Math.max(0, delay)));
	}

	return () => timers.forEach(clearTimeout);
}

/** Sends one notification immediately, so the user can confirm it works. */
export async function sendTestNotification(): Promise<boolean> {
	if (!browser || Notification.permission !== 'granted') return false;
	await show({
		id: `test-${Date.now()}`,
		fireAt: Date.now(),
		exposureAt: Date.now(),
		title: 'Skeetr notifications are on',
		body: 'This is what a dusk warning will look like.',
		score: 0,
		band: 2,
		kind: 'protect'
	});
	return true;
}
