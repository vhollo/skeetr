import { DEGREE_DAY } from './params';
import type { WeatherHour } from './types';

/**
 * Degree-days accumulated by a single hour, using the horizontal-cutoff method:
 * heat above the base temperature drives development, heat above the ceiling
 * buys nothing further.
 *
 * Working in hourly steps (rather than from daily min/max) means a warm night
 * counts properly, which matters for the emergence timing this app is built on.
 */
export function hourlyDegreeDays(hour: WeatherHour): number {
	const { baseTempC, ceilingTempC } = DEGREE_DAY;
	const effective = Math.min(hour.temperatureC, ceilingTempC);
	if (effective <= baseTempC) return 0;
	return (effective - baseTempC) / 24;
}

/** Total degree-days across a span of hours. */
export function accumulate(hours: WeatherHour[]): number {
	let total = 0;
	for (const hour of hours) total += hourlyDegreeDays(hour);
	return total;
}
