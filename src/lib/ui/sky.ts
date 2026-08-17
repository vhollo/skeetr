import { solarFor } from '$lib/model/activity';
import type { WeatherDay } from '$lib/model/types';

/**
 * Sky colour for an instant, from the sun's position relative to the horizon.
 *
 * This is what makes the ribbon legible at a glance: the chart's own background
 * is the sky at that hour, so the twice-daily swell of risk visibly lines up with
 * dusk and dawn instead of needing a legend to explain it.
 */

const NIGHT = '#080d20';
const ASTRONOMICAL = '#141a3a';
const TWILIGHT = '#3b2d5e';
const GOLDEN = '#7c4d33';
const DAY = '#22405a';

/** Minutes either side of sunrise/sunset for each band of twilight. */
const GOLDEN_MIN = 45;
const CIVIL_MIN = 100;
const ASTRO_MIN = 170;

export function skyColour(time: number, days: WeatherDay[]): string {
	const { sunrise, sunset } = solarFor(time, days);

	const toSunrise = (time - sunrise) / 60_000;
	const toSunset = (time - sunset) / 60_000;

	// Distance to the nearest horizon crossing, signed so we know day from night.
	const nearest = Math.abs(toSunrise) < Math.abs(toSunset) ? toSunrise : toSunset;
	const distance = Math.abs(nearest);
	const isDaySide = toSunrise >= 0 && toSunset <= 0;

	if (distance <= GOLDEN_MIN) return mix(GOLDEN, isDaySide ? DAY : TWILIGHT, distance / GOLDEN_MIN / 2);
	if (distance <= CIVIL_MIN) {
		const t = (distance - GOLDEN_MIN) / (CIVIL_MIN - GOLDEN_MIN);
		return isDaySide ? mix(GOLDEN, DAY, t) : mix(TWILIGHT, ASTRONOMICAL, t);
	}
	if (isDaySide) return DAY;
	if (distance <= ASTRO_MIN) {
		return mix(ASTRONOMICAL, NIGHT, (distance - CIVIL_MIN) / (ASTRO_MIN - CIVIL_MIN));
	}
	return NIGHT;
}

/** Linear blend of two hex colours. */
function mix(from: string, to: string, t: number): string {
	const amount = Math.max(0, Math.min(1, t));
	const a = hexToRgb(from);
	const b = hexToRgb(to);
	const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount);
	return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

function hexToRgb(hex: string): [number, number, number] {
	const value = parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export const BAND_COLOURS = [
	'var(--color-band-0)',
	'var(--color-band-1)',
	'var(--color-band-2)',
	'var(--color-band-3)',
	'var(--color-band-4)'
];

export function bandColour(band: number): string {
	return BAND_COLOURS[Math.max(0, Math.min(BAND_COLOURS.length - 1, band))];
}
