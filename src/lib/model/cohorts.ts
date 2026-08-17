import { clamp, DAY_MS, ramp } from './curves';
import { hourlyDegreeDays } from './degreeDays';
import { ADULT, BREEDING } from './params';
import type { SpeciesProfile } from './species';
import type { Cohort, WeatherDay, WeatherHour } from './types';

/**
 * Layer A of the model: how many adult mosquitoes are around.
 *
 * The central idea is that rain does not produce mosquitoes — it floods eggs.
 * Each rain event seeds a cohort, and that cohort only becomes biting adults once
 * enough warmth has accumulated since. Using degree-days rather than a fixed
 * "7-10 days after rain" rule of thumb means the forecast self-corrects: a heat
 * wave pulls emergence forward by days, a cold snap pushes it back.
 */

interface RainEvent {
	/** Index of the last hour of the event. Development starts here. */
	endIndex: number;
	totalMm: number;
	/** Soil moisture going into the event, if the weather model reported it. */
	antecedentSoil?: number;
}

export function detectRainEvents(hours: WeatherHour[]): RainEvent[] {
	const events: RainEvent[] = [];
	let current: { total: number; endIndex: number; soil?: number } | null = null;
	let dryRun = 0;

	for (let i = 0; i < hours.length; i++) {
		const rain = hours[i].precipitationMm;

		if (rain >= BREEDING.minHourlyRainMm) {
			if (!current) {
				current = {
					total: 0,
					endIndex: i,
					// Soil state just before the first drop is what decides whether
					// this water pools or soaks straight in.
					soil: hours[Math.max(0, i - 1)].soilMoisture
				};
			}
			current.total += rain;
			current.endIndex = i;
			dryRun = 0;
		} else if (current) {
			dryRun++;
			if (dryRun >= BREEDING.eventGapHours) {
				events.push({
					endIndex: current.endIndex,
					totalMm: current.total,
					antecedentSoil: current.soil
				});
				current = null;
				dryRun = 0;
			}
		}
	}

	if (current) {
		events.push({
			endIndex: current.endIndex,
			totalMm: current.total,
			antecedentSoil: current.soil
		});
	}

	return events;
}

/** 0..1 cohort size for a rain event. */
export function cohortMass(event: RainEvent): number {
	// Concave in rainfall: the first few millimetres do most of the work by
	// wetting every container that was dry, and further rain only tops up water
	// that is already there. A linear response badly undercounts the 5-10 mm
	// events that drive real breeding in a wet climate.
	const volume = Math.sqrt(
		ramp(event.totalMm, BREEDING.minHourlyRainMm, BREEDING.saturatingRainMm)
	);

	// Rain onto already-saturated ground pools and breeds; rain onto baked ground
	// largely disappears. When the model has no soil data, assume average ground.
	const soil = event.antecedentSoil;
	const soilFactor =
		soil == null
			? 0.8
			: BREEDING.drySoilPenalty +
				(1 - BREEDING.drySoilPenalty) * ramp(soil, 0.1, BREEDING.saturatedSoilM3);

	return clamp(volume * soilFactor);
}

export interface PopulationResult {
	cohorts: Cohort[];
	/** 0..1 standing adult population index, one entry per input hour. */
	population: number[];
}

interface TrackedCohort extends Cohort {
	/** Mass surviving right now — drops with flushing, then with adult mortality. */
	current: number;
}

/**
 * Walks the hourly series once, advancing every cohort's development and decay.
 *
 * Returns a population index aligned index-for-index with `hours`, so the caller
 * can pair it with the hourly activity multiplier.
 */
export function computePopulation(
	hours: WeatherHour[],
	profile: SpeciesProfile,
	days: WeatherDay[] = []
): PopulationResult {
	// Day records carry local-midnight timestamps, so resolve an hour to its day by
	// range rather than by flooring to a UTC day — otherwise every location east or
	// west of UTC attributes afternoon hours to the wrong day's maximum.
	const dayMaxAt = makeDayMaxResolver(days);

	const events = detectRainEvents(hours);
	const bySeedHour = new Map<number, RainEvent[]>();
	for (const event of events) {
		const list = bySeedHour.get(event.endIndex);
		if (list) list.push(event);
		else bySeedHour.set(event.endIndex, [event]);
	}

	const tracked: TrackedCohort[] = [];
	const population: number[] = new Array(hours.length).fill(0);
	const threshold = profile.degreeDaysToAdult;

	// Urban container habitat (plant saucers, watered pots, blocked gutters, ponds)
	// keeps a trickle of breeding going through dry spells. Without this the model
	// wrongly reports zero mosquitoes after two rainless weeks in a city.
	let baselineCarry = 0;

	for (let i = 0; i < hours.length; i++) {
		const hour = hours[i];

		// 1. Seed new cohorts from rain events that ended this hour.
		for (const event of bySeedHour.get(i) ?? []) {
			const mass = cohortMass(event);
			if (mass <= 0) continue;
			tracked.push({
				startedAt: hour.time,
				rainMm: event.totalMm,
				mass,
				degreeDays: 0,
				progress: 0,
				current: mass
			});
		}

		// 2. A daily trickle from permanent habitat. Scaled by how dry the ground is:
		//    in a real drought the saucers and gutters evaporate too, so the floor
		//    has to fall away rather than prop the population up through a dry spell.
		const habitatFactor =
			hour.soilMoisture == null
				? 0.8
				: BREEDING.drySoilPenalty +
					(1 - BREEDING.drySoilPenalty) * ramp(hour.soilMoisture, 0.1, BREEDING.saturatedSoilM3);
		baselineCarry += (BREEDING.baselineHabitat * habitatFactor) / 24;
		if (baselineCarry >= BREEDING.baselineHabitat) {
			tracked.push({
				startedAt: hour.time,
				rainMm: 0,
				mass: baselineCarry,
				degreeDays: 0,
				progress: 0,
				current: baselineCarry
			});
			baselineCarry = 0;
		}

		// 3. Torrential rain flushes larvae out of containers and ditches.
		if (hour.precipitationMm >= BREEDING.flushingRainMmPerHour) {
			for (const cohort of tracked) {
				if (cohort.emergedAt == null) cohort.current *= 1 - BREEDING.flushLossFraction;
			}
		}

		const dd = hourlyDegreeDays(hour);
		const dayMax = dayMaxAt(hour.time) ?? hour.temperatureC;

		let standing = 0;

		for (const cohort of tracked) {
			if (cohort.emergedAt == null) {
				// 4. Immature development.
				cohort.degreeDays += dd;
				cohort.progress = clamp(cohort.degreeDays / threshold);
				if (cohort.degreeDays >= threshold) {
					cohort.emergedAt = hour.time;
				}
				continue;
			}

			// 5. Adult mortality, compounding hourly.
			let hazard = 1 / (ADULT.halfLifeDays * 24);
			if (dayMax >= ADULT.heatStressTempC) hazard *= ADULT.heatStressMultiplier;
			cohort.current *= Math.pow(0.5, hazard);

			if (hour.temperatureC <= ADULT.killingFrostTempC) cohort.current = 0;

			standing += cohort.current;
		}

		population[i] = clamp(standing / ADULT.saturatingCohortMass);
	}

	// Drop cohorts that never amounted to anything, so the Outlook chart stays readable.
	const cohorts = tracked
		.filter((c) => c.mass >= 0.02)
		.map(({ current: _current, ...rest }) => rest);

	return { cohorts, population };
}

/**
 * Resolves an instant to its local calendar day's maximum temperature.
 * Days are ascending and non-overlapping, so a plain scan with memoised bounds
 * is enough; the series is at most a few hundred entries.
 */
function makeDayMaxResolver(days: WeatherDay[]): (time: number) => number | undefined {
	if (days.length === 0) return () => undefined;
	return (time: number) => {
		for (const day of days) {
			if (time >= day.date && time < day.date + DAY_MS) return day.tempMaxC;
		}
		return undefined;
	};
}

/**
 * Cohorts that had not yet emerged as of `now`, most developed first.
 *
 * A cohort record describes its whole life across the series, so "is it still
 * developing?" is a question about a moment in time, not about the record. The
 * returned `progress` is therefore recomputed as of `now` — otherwise a batch
 * that emerges next Tuesday would report as fully grown today.
 */
export function pendingCohorts(cohorts: Cohort[], now: number = Date.now()): Cohort[] {
	return cohorts
		.filter((c) => c.startedAt <= now && (c.emergedAt == null || c.emergedAt > now))
		.map((c) => ({ ...c, progress: progressAt(c, now) }))
		.filter((c) => c.progress > 0.05)
		.sort((a, b) => b.progress - a.progress);
}

/** Development fraction of a cohort at an arbitrary instant, 0..1. */
export function progressAt(cohort: Cohort, now: number): number {
	if (now <= cohort.startedAt) return 0;
	if (cohort.emergedAt != null) {
		if (now >= cohort.emergedAt) return 1;
		// Degree-day accumulation is close enough to linear across a single
		// cohort's development window to interpolate between the known endpoints.
		return clamp((now - cohort.startedAt) / (cohort.emergedAt - cohort.startedAt));
	}
	return cohort.progress;
}
