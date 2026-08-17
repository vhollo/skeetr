import type { Setting } from '$lib/model/countermeasures';
import type { SpeciesId } from '$lib/model/species';
import { persisted } from './persisted.svelte';

export interface Prefs {
	species: SpeciesId;
	setting: Setting;
	/** Lowest band that produces an alert. */
	minBand: number;
	quietHours: { start: number; end: number } | null;
	notificationsEnabled: boolean;
	units: 'metric' | 'imperial';
}

const DEFAULTS: Prefs = {
	species: 'auto',
	setting: 'outdoor',
	minBand: 2,
	quietHours: { start: 23, end: 7 },
	notificationsEnabled: false,
	units: 'metric'
};

const store = persisted<Prefs>('skeeter:prefs', DEFAULTS);

export const prefs = {
	get current() {
		return store.current;
	},
	update(patch: Partial<Prefs>) {
		store.current = { ...store.current, ...patch };
	},
	reset() {
		store.reset();
	}
};

/** Imperial users still think in mph and Fahrenheit; the model stays metric. */
export function formatTemp(celsius: number, units: Prefs['units']): string {
	return units === 'imperial'
		? `${Math.round(celsius * 1.8 + 32)}°F`
		: `${Math.round(celsius)}°C`;
}

export function formatWind(kmh: number, units: Prefs['units']): string {
	return units === 'imperial' ? `${Math.round(kmh * 0.621)} mph` : `${Math.round(kmh)} km/h`;
}
