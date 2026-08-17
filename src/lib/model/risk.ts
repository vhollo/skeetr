import { activityFor } from './activity';
import { computePopulation } from './cohorts';
import { HOUR_MS } from './curves';
import { BANDS, PROTECT_THRESHOLD } from './params';
import { resolveSpecies, type SpeciesId, type SpeciesProfile } from './species';
import type { Cohort, Forecast, ProtectWindow, RiskPoint } from './types';

export interface Assessment {
	profile: SpeciesProfile;
	points: RiskPoint[];
	cohorts: Cohort[];
	/** Where the forecast came from, echoed for display. */
	place: { latitude: number; longitude: number; timezone: string };
	fetchedAt: number;
}

/**
 * Composes the population layer and the activity layer into an hourly risk series.
 *
 * The product form is deliberate: plenty of mosquitoes on a windy 8 C evening is
 * still no risk, and perfect biting weather in February is still no risk.
 */
export function assess(forecast: Forecast, speciesId: SpeciesId = 'auto'): Assessment {
	const profile = resolveSpecies(speciesId, forecast.latitude);
	const { cohorts, population } = computePopulation(forecast.hours, profile, forecast.days);

	const points: RiskPoint[] = forecast.hours.map((hour, i) => {
		const activity = activityFor(hour, forecast.days, profile);
		const score = Math.round(population[i] * activity.total * 100);
		return {
			time: hour.time,
			score,
			band: bandFor(score),
			population: population[i],
			activity,
			weather: hour
		};
	});

	return {
		profile,
		points,
		cohorts,
		place: {
			latitude: forecast.latitude,
			longitude: forecast.longitude,
			timezone: forecast.timezone
		},
		fetchedAt: forecast.fetchedAt
	};
}

export function bandFor(score: number): number {
	let band = 0;
	for (const entry of BANDS) {
		if (score >= entry.min) band = entry.id;
	}
	return band;
}

export function bandLabel(band: number): string {
	return BANDS.find((b) => b.id === band)?.label ?? 'Unknown';
}

/** Only the hours from `from` onward — the past is model input, not user-facing. */
export function futurePoints(points: RiskPoint[], from = Date.now()): RiskPoint[] {
	const cutoff = from - HOUR_MS;
	return points.filter((p) => p.time >= cutoff);
}

/** The point covering `time`, i.e. the hour the user is currently living in. */
export function pointAt(points: RiskPoint[], time = Date.now()): RiskPoint | undefined {
	let best: RiskPoint | undefined;
	for (const point of points) {
		if (point.time <= time && time < point.time + HOUR_MS) return point;
		if (point.time <= time) best = point;
	}
	return best;
}

/**
 * Contiguous runs of hours worth protecting against. These become the shaded
 * bands on the timeline, the notification schedule, and the calendar events.
 */
export function protectWindows(
	points: RiskPoint[],
	threshold = PROTECT_THRESHOLD
): ProtectWindow[] {
	const windows: ProtectWindow[] = [];
	let open: ProtectWindow | null = null;

	for (const point of points) {
		if (point.score >= threshold) {
			if (!open) {
				open = {
					start: point.time,
					end: point.time + HOUR_MS,
					peakScore: point.score,
					peakBand: point.band,
					peakTime: point.time
				};
			} else {
				open.end = point.time + HOUR_MS;
				if (point.score > open.peakScore) {
					open.peakScore = point.score;
					open.peakBand = point.band;
					open.peakTime = point.time;
				}
			}
		} else if (open) {
			windows.push(open);
			open = null;
		}
	}

	if (open) windows.push(open);
	return windows;
}

/** The next window starting at or after `from`, or the one already in progress. */
export function nextWindow(
	windows: ProtectWindow[],
	from = Date.now()
): ProtectWindow | undefined {
	return windows.find((w) => w.end > from);
}
