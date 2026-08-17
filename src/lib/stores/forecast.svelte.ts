import { assess, futurePoints, protectWindows, type Assessment } from '$lib/model/risk';
import type { Forecast, Place, ProtectWindow, RiskPoint } from '$lib/model/types';
import { buildAlerts, type Alert } from '$lib/model/schedule';
import { prefs } from './prefs.svelte';

export interface LoadedForecast {
	assessment: Assessment;
	upcoming: RiskPoint[];
	windows: ProtectWindow[];
	alerts: Alert[];
}

/** In-memory cache so switching between saved places is instant. */
const cache = new Map<string, { forecast: Forecast; at: number }>();
const TTL_MS = 15 * 60 * 1000;

function key(latitude: number, longitude: number): string {
	return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

export async function loadForecast(
	latitude: number,
	longitude: number,
	fetchImpl: typeof fetch = fetch
): Promise<Forecast> {
	const cacheKey = key(latitude, longitude);
	const hit = cache.get(cacheKey);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.forecast;

	const response = await fetchImpl(`/api/forecast?lat=${latitude}&lon=${longitude}`);
	if (!response.ok) {
		const detail = await response.json().catch(() => ({ message: '' }));
		throw new Error(detail.message || `Could not load the forecast (${response.status})`);
	}

	const forecast = (await response.json()) as Forecast;
	cache.set(cacheKey, { forecast, at: Date.now() });
	return forecast;
}

/** Runs the model and everything derived from it for one place. */
export function evaluate(forecast: Forecast, now = Date.now()): LoadedForecast {
	const assessment = assess(forecast, prefs.current.species);
	const upcoming = futurePoints(assessment.points, now);
	const windows = protectWindows(upcoming);
	const alerts = buildAlerts(windows, upcoming, assessment.cohorts, {
		setting: prefs.current.setting,
		now,
		minBand: prefs.current.minBand,
		quietHours: prefs.current.quietHours,
		timezone: assessment.place.timezone
	});

	return { assessment, upcoming, windows, alerts };
}

export interface GeoPosition {
	latitude: number;
	longitude: number;
	accuracyM: number;
}

export function currentPosition(): Promise<GeoPosition> {
	return new Promise((resolve, reject) => {
		if (!('geolocation' in navigator)) {
			reject(new Error('This browser cannot report your location.'));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) =>
				resolve({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracyM: position.coords.accuracy
				}),
			(err) => {
				const messages: Record<number, string> = {
					1: 'Location permission was declined. You can still add a place by name.',
					2: 'Your location is unavailable right now.',
					3: 'Finding your location took too long.'
				};
				reject(new Error(messages[err.code] ?? err.message));
			},
			{ enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 }
		);
	});
}

export function placeFromPosition(position: GeoPosition, forecast: Forecast): Place {
	return {
		id: 'current',
		name: 'Current location',
		latitude: position.latitude,
		longitude: position.longitude,
		timezone: forecast.timezone
	};
}
