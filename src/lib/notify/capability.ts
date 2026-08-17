import { browser } from '$app/environment';

/**
 * What this particular device can actually do about notifications.
 *
 * The app has no push server by design, which puts hard limits on delivery. It
 * would be easy to show a permission prompt and let people assume they will be
 * warned at dusk while their phone is in their pocket — they will not be. This
 * module exists so the UI can say precisely what will and will not happen here.
 */

export type Tier = 'foreground' | 'periodic-sync' | 'calendar-only';

export interface Capability {
	tier: Tier;
	/** Notification API present and usable. */
	canNotify: boolean;
	permission: NotificationPermission | 'unsupported';
	installed: boolean;
	periodicSync: boolean;
	/** Plain-language statement of what the user will actually receive. */
	summary: string;
}

export function isInstalled(): boolean {
	if (!browser) return false;
	return (
		window.matchMedia?.('(display-mode: standalone)').matches ||
		// iOS Safari's own flag for a Home Screen app.
		(navigator as unknown as { standalone?: boolean }).standalone === true
	);
}

export async function detect(): Promise<Capability> {
	if (!browser) {
		return {
			tier: 'calendar-only',
			canNotify: false,
			permission: 'unsupported',
			installed: false,
			periodicSync: false,
			summary: ''
		};
	}

	const canNotify = 'Notification' in window && 'serviceWorker' in navigator;
	const permission: NotificationPermission | 'unsupported' = canNotify
		? Notification.permission
		: 'unsupported';
	const installed = isInstalled();

	let periodicSync = false;
	if (canNotify && 'periodicSync' in ServiceWorkerRegistration.prototype) {
		try {
			const status = await navigator.permissions.query({
				name: 'periodic-background-sync' as PermissionName
			});
			periodicSync = status.state === 'granted';
		} catch {
			periodicSync = false;
		}
	}

	const tier: Tier = !canNotify ? 'calendar-only' : periodicSync ? 'periodic-sync' : 'foreground';

	return { tier, canNotify, permission, installed, periodicSync, summary: summarise(tier, installed) };
}

function summarise(tier: Tier, installed: boolean): string {
	switch (tier) {
		case 'periodic-sync':
			return 'Alerts fire while the app is open, and this browser will also wake it roughly twice a day to check ahead. Subscribe to the calendar for alerts that always arrive on time.';
		case 'foreground':
			return installed
				? 'Alerts fire while the app is open or just backgrounded. They cannot fire once the system has fully closed it — subscribe to the calendar to be warned when the app is shut.'
				: 'Alerts fire only while the app is open in this tab. To be warned when it is closed, subscribe to the calendar below.';
		case 'calendar-only':
			return 'This browser cannot show notifications from a web app. The calendar subscription is the way to get warned here.';
	}
}

export async function requestPermission(): Promise<NotificationPermission> {
	if (!browser || !('Notification' in window)) return 'denied';
	if (Notification.permission !== 'default') return Notification.permission;
	return Notification.requestPermission();
}
