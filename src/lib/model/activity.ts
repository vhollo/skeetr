import { bump, clamp, ramp, trapezoid } from './curves';
import { ACTIVITY } from './params';
import type { SpeciesProfile } from './species';
import type { ActivityFactors, WeatherDay, WeatherHour } from './types';

/**
 * Layer B of the model: given that mosquitoes exist, are they flying and biting
 * in this particular hour?
 *
 * Each factor is an independent 0..1 multiplier. They multiply rather than
 * average because any one of them can shut biting down on its own — a 20 km/h
 * wind means no bites regardless of how warm and humid it is.
 */

export function temperatureFactor(temperatureC: number): number {
	const { floorC, optimalLowC, optimalHighC, ceilingC } = ACTIVITY.temp;
	return trapezoid(temperatureC, floorC, optimalLowC, optimalHighC, ceilingC);
}

/**
 * Converts a reported 10 m wind to what is felt at biting height, among the
 * hedges and furniture where people actually sit.
 */
export function groundWind(reportedKmh: number): number {
	return reportedKmh * ACTIVITY.wind.tenMetreToGroundFactor;
}

/**
 * Mosquitoes are weak fliers; moving air grounds them well before it feels windy.
 * Takes near-ground wind — pass a reported 10 m value through `groundWind` first.
 */
export function windFactor(groundKmh: number): number {
	const { calmKmh, groundedKmh } = ACTIVITY.wind;
	return 1 - ramp(groundKmh, calmKmh, groundedKmh);
}

export function rainFactor(precipitationMm: number): number {
	const { lightMmPerHour, heavyMmPerHour, floorMultiplier } = ACTIVITY.rain;
	const suppression = ramp(precipitationMm, lightMmPerHour, heavyMmPerHour);
	return 1 - suppression * (1 - floorMultiplier);
}

/** Dry air desiccates them, so they stay in sheltered humid refuges. */
export function humidityFactor(humidityPct: number): number {
	const { dryPct, comfortablePct, floorMultiplier } = ACTIVITY.humidity;
	const comfort = ramp(humidityPct, 0, comfortablePct);
	if (humidityPct >= comfortablePct) return 1;
	const scaled = ramp(humidityPct, 0, dryPct) * 0.7 + comfort * 0.3;
	return floorMultiplier + (1 - floorMultiplier) * clamp(scaled);
}

/**
 * The crepuscular curve, keyed to actual solar times rather than clock hours —
 * "an hour before sunset" is a real biological cue, "7pm" is not.
 */
export function dielFactor(
	time: number,
	sunrise: number,
	sunset: number,
	isDay: boolean,
	profile: SpeciesProfile
): number {
	const { peakHalfWidthMin, shoulderHalfWidthMin } = ACTIVITY.diel;
	const toSunset = (time - sunset) / 60_000;
	const toSunrise = (time - sunrise) / 60_000;

	const duskPeak = bump(toSunset, peakHalfWidthMin);
	const dawnPeak = bump(toSunrise, peakHalfWidthMin) * profile.dawnPeakRatio;
	const shoulder =
		0.45 *
		Math.max(
			bump(toSunset, shoulderHalfWidthMin),
			bump(toSunrise, shoulderHalfWidthMin) * profile.dawnPeakRatio
		);

	const baseline = isDay ? profile.daytimeBaseline : profile.nightBaseline;

	return clamp(Math.max(baseline, shoulder, duskPeak, dawnPeak));
}

/** Nearest sunrise/sunset pair for an arbitrary instant. */
export function solarFor(time: number, days: WeatherDay[]): { sunrise: number; sunset: number } {
	if (days.length === 0) {
		// Fall back to a generic 06:00/20:00 rather than dividing by nothing.
		const dayStart = Math.floor(time / 86_400_000) * 86_400_000;
		return { sunrise: dayStart + 6 * 3_600_000, sunset: dayStart + 20 * 3_600_000 };
	}

	let best = days[0];
	let bestDistance = Infinity;
	for (const day of days) {
		const distance = Math.abs(day.sunset - time);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = day;
		}
	}
	return { sunrise: best.sunrise, sunset: best.sunset };
}

export function activityFor(
	hour: WeatherHour,
	days: WeatherDay[],
	profile: SpeciesProfile
): ActivityFactors {
	const { sunrise, sunset } = solarFor(hour.time, days);

	const temperature = temperatureFactor(hour.temperatureC);
	const wind = windFactor(groundWind(hour.windKmh));
	const rain = rainFactor(hour.precipitationMm);
	const humidity = humidityFactor(hour.humidityPct);
	const diel = dielFactor(hour.time, sunrise, sunset, hour.isDay, profile);

	return {
		temperature,
		wind,
		rain,
		humidity,
		diel,
		total: temperature * wind * rain * humidity * diel
	};
}
