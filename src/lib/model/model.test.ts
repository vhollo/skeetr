import { describe, expect, it } from 'vitest';
import budapest from './__fixtures__/budapest.json';
import neworleans from './__fixtures__/neworleans.json';
import { rainOn, synthForecast } from './__fixtures__/synth';
import { activityFor, groundWind, humidityFactor, temperatureFactor, windFactor } from './activity';
import { computePopulation, detectRainEvents } from './cohorts';
import { DAY_MS } from './curves';
import { accumulate, hourlyDegreeDays } from './degreeDays';
import { assess, bandFor, protectWindows } from './risk';
import { PROFILES, resolveSpecies } from './species';
import { normalize } from './weather';

describe('activity response curves', () => {
	it('reports no activity below the flight threshold', () => {
		expect(temperatureFactor(5)).toBe(0);
		expect(temperatureFactor(9)).toBe(0);
	});

	it('peaks across the optimal band and collapses in extreme heat', () => {
		expect(temperatureFactor(26)).toBe(1);
		expect(temperatureFactor(24)).toBe(1);
		expect(temperatureFactor(38)).toBe(0);
		expect(temperatureFactor(34)).toBeLessThan(0.6);
	});

	it('grounds mosquitoes in wind', () => {
		expect(windFactor(3)).toBe(1);
		expect(windFactor(20)).toBe(0);
		expect(windFactor(11)).toBeLessThan(0.6);
		expect(windFactor(11)).toBeGreaterThan(0.3);
	});

	it('reads the reported 10 m wind down to what is felt at biting height', () => {
		// A brisk 25 km/h forecast is not 25 km/h in a garden. Applying the raw
		// 10 m value to the flight curve wrongly zeroes ordinary breezy evenings.
		expect(groundWind(25)).toBeLessThan(25);
		expect(windFactor(groundWind(20))).toBeGreaterThan(0);
		expect(windFactor(groundWind(45))).toBe(0);
	});

	it('suppresses activity in dry air', () => {
		expect(humidityFactor(80)).toBe(1);
		expect(humidityFactor(20)).toBeLessThan(0.7);
		expect(humidityFactor(20)).toBeGreaterThan(0.2);
	});
});

describe('degree days', () => {
	it('accumulates nothing at or below the base temperature', () => {
		expect(hourlyDegreeDays({ temperatureC: 10.5 } as never)).toBe(0);
		expect(hourlyDegreeDays({ temperatureC: 2 } as never)).toBe(0);
	});

	it('caps the contribution of extreme heat', () => {
		const at34 = hourlyDegreeDays({ temperatureC: 34 } as never);
		const at42 = hourlyDegreeDays({ temperatureC: 42 } as never);
		expect(at42).toBe(at34);
	});

	it('sums to roughly (mean - base) per full day', () => {
		const forecast = synthForecast({ days: 1, meanTempC: 20.5, amplitudeC: 0 });
		expect(accumulate(forecast.hours)).toBeCloseTo(10, 5);
	});
});

describe('rain event detection', () => {
	it('groups contiguous rain into one event and ignores drizzle', () => {
		const forecast = synthForecast({
			days: 6,
			meanTempC: 22,
			rain: { ...rainOn(1), 80: 0.1, 81: 0.2 }
		});
		const events = detectRainEvents(forecast.hours);
		expect(events).toHaveLength(1);
		expect(events[0].totalMm).toBeCloseTo(24, 5);
	});

	it('splits events separated by a long dry gap', () => {
		const forecast = synthForecast({
			days: 8,
			meanTempC: 22,
			rain: { ...rainOn(1), ...rainOn(4) }
		});
		expect(detectRainEvents(forecast.hours)).toHaveLength(2);
	});
});

describe('cohort emergence', () => {
	const culex = PROFILES.culex;

	// Long enough that even a cool spell reaches the threshold within the window;
	// at ~4.7 degree-days a day, 145 DD takes over a month.
	function emergenceLagDays(meanTempC: number, days = 70): number {
		const forecast = synthForecast({ days, meanTempC, rain: rainOn(1) });
		const { cohorts } = computePopulation(forecast.hours, culex, forecast.days);
		// The rain-seeded cohort is the one with meaningful rainfall behind it.
		const seeded = cohorts.find((c) => c.rainMm > 10);
		expect(seeded, `no cohort seeded at ${meanTempC}C`).toBeDefined();
		expect(seeded!.emergedAt, `cohort never emerged at ${meanTempC}C`).toBeDefined();
		return (seeded!.emergedAt! - seeded!.startedAt) / DAY_MS;
	}

	it('emerges within the classic 7-10 day window at typical summer warmth', () => {
		const lag = emergenceLagDays(25);
		expect(lag).toBeGreaterThan(6);
		expect(lag).toBeLessThan(12);
	});

	it('pulls emergence forward in a heat wave and delays it in a cool spell', () => {
		const hot = emergenceLagDays(31);
		const mild = emergenceLagDays(23);
		const cool = emergenceLagDays(15);

		expect(hot).toBeLessThan(mild);
		expect(mild).toBeLessThan(cool);
		// The whole point of the degree-day approach: the spread is large.
		expect(cool - hot).toBeGreaterThan(4);
	});

	it('never emerges when it stays below the development base temperature', () => {
		const forecast = synthForecast({ days: 30, meanTempC: 8, amplitudeC: 1, rain: rainOn(1) });
		const { cohorts, population } = computePopulation(forecast.hours, culex, forecast.days);
		expect(cohorts.every((c) => c.emergedAt == null)).toBe(true);
		expect(Math.max(...population)).toBe(0);
	});

	it('builds a larger population from rain on saturated ground than on dry ground', () => {
		const wet = synthForecast({ days: 30, meanTempC: 25, soilMoisture: 0.38, rain: rainOn(1) });
		const dry = synthForecast({ days: 30, meanTempC: 25, soilMoisture: 0.05, rain: rainOn(1) });

		const wetPeak = Math.max(...computePopulation(wet.hours, culex, wet.days).population);
		const dryPeak = Math.max(...computePopulation(dry.hours, culex, dry.days).population);

		expect(wetPeak).toBeGreaterThan(dryPeak);
	});

	it('decays the surge from a rain event away over the following fortnight', () => {
		// Measured as the *difference* against an identical rainless run, so the
		// permanent-habitat floor cancels out and only the rain cohort is under test.
		const wet = synthForecast({ days: 40, meanTempC: 25, rain: rainOn(1) });
		const dry = synthForecast({ days: 40, meanTempC: 25 });

		const wetPop = computePopulation(wet.hours, culex, wet.days).population;
		const dryPop = computePopulation(dry.hours, culex, dry.days).population;
		const surge = wetPop.map((v, i) => v - dryPop[i]);

		const peakIndex = surge.indexOf(Math.max(...surge));
		expect(surge[peakIndex]).toBeGreaterThan(0.1);

		const twoWeeksLater = surge[Math.min(peakIndex + 14 * 24, surge.length - 1)];
		expect(twoWeeksLater).toBeLessThan(surge[peakIndex] * 0.5);
	});

	it('keeps the permanent-habitat floor well below a rain-driven surge', () => {
		// Guards the calibration: if the rainless baseline ever rivals the rain
		// response, the model has stopped being about rainfall.
		const wet = synthForecast({ days: 40, meanTempC: 25, rain: rainOn(1) });
		const dry = synthForecast({ days: 40, meanTempC: 25 });

		const wetPeak = Math.max(...computePopulation(wet.hours, culex, wet.days).population);
		const dryPeak = Math.max(...computePopulation(dry.hours, culex, dry.days).population);

		expect(dryPeak).toBeGreaterThan(0);
		expect(dryPeak).toBeLessThan(wetPeak * 0.5);
	});
});

describe('species profiles', () => {
	it('puts the Culex peak at night and the Aedes baseline in daylight', () => {
		const forecast = synthForecast({ days: 3, meanTempC: 25 });
		const noon = forecast.hours.find((h) => new Date(h.time).getUTCHours() === 12)!;

		const culex = activityFor(noon, forecast.days, PROFILES.culex);
		const aedes = activityFor(noon, forecast.days, PROFILES.aedes);

		expect(aedes.diel).toBeGreaterThan(culex.diel);
	});

	it('resolves auto by latitude', () => {
		expect(resolveSpecies('auto', 41).id).toBe('aedes');
		expect(resolveSpecies('auto', 60).id).toBe('culex');
		expect(resolveSpecies('culex', 41).id).toBe('culex');
	});
});

describe('risk composition', () => {
	it('scores zero when it is too cold to fly, however many mosquitoes exist', () => {
		const forecast = synthForecast({ days: 30, meanTempC: 25, rain: rainOn(1) });
		// Freeze the last day solid; population is high by then, activity must be nil.
		for (const hour of forecast.hours.slice(-24)) hour.temperatureC = 3;

		const { points } = assess(forecast, 'culex');
		const frozen = points.slice(-24);
		expect(frozen.every((p) => p.score === 0)).toBe(true);
		expect(Math.max(...frozen.map((p) => p.population))).toBeGreaterThan(0.1);
	});

	it('scores zero in a gale', () => {
		const forecast = synthForecast({ days: 30, meanTempC: 25, rain: rainOn(1) });
		for (const hour of forecast.hours.slice(-24)) hour.windKmh = 30;

		const { points } = assess(forecast, 'culex');
		expect(points.slice(-24).every((p) => p.score === 0)).toBe(true);
	});

	it('rates a warm still humid dusk after rain above a windy dry one', () => {
		const calm = synthForecast({ days: 20, meanTempC: 25, windKmh: 1, rain: rainOn(1) });
		const windy = synthForecast({ days: 20, meanTempC: 25, windKmh: 14, rain: rainOn(1) });

		const calmPeak = Math.max(...assess(calm, 'culex').points.map((p) => p.score));
		const windyPeak = Math.max(...assess(windy, 'culex').points.map((p) => p.score));

		expect(calmPeak).toBeGreaterThan(windyPeak);
	});

	it('assigns bands monotonically', () => {
		expect(bandFor(0)).toBe(0);
		expect(bandFor(10)).toBe(1);
		expect(bandFor(30)).toBe(2);
		expect(bandFor(60)).toBe(3);
		expect(bandFor(90)).toBe(4);
	});
});

describe('protect windows', () => {
	it('merges consecutive risky hours into one window and finds the peak', () => {
		const points = [10, 12, 40, 60, 45, 5, 8, 30].map((score, i) => ({
			time: i * 3_600_000,
			score,
			band: bandFor(score),
			population: 0.5,
			activity: {} as never,
			weather: {} as never
		}));

		const windows = protectWindows(points);
		expect(windows).toHaveLength(2);
		expect(windows[0].peakScore).toBe(60);
		expect(windows[0].start).toBe(2 * 3_600_000);
		expect(windows[0].end).toBe(5 * 3_600_000);
		expect(windows[1].peakScore).toBe(30);
	});
});

describe('real Open-Meteo payload', () => {
	const forecast = normalize(budapest as never, Date.UTC(2026, 7, 17));

	it('normalises 21 days of hourly data', () => {
		expect(forecast.hours).toHaveLength(504);
		expect(forecast.days).toHaveLength(21);
		expect(forecast.timezone).toBe('Europe/Budapest');
		expect(forecast.hours.every((h) => Number.isFinite(h.temperatureC))).toBe(true);
		expect(forecast.hours.every((h) => h.time > 0)).toBe(true);
	});

	it('keeps sunrise before sunset on every day', () => {
		expect(forecast.days.every((d) => d.sunrise < d.sunset)).toBe(true);
	});

	it('rates a hot, bone-dry Budapest August as low risk despite the warmth', () => {
		const { points } = assess(forecast, 'auto');
		const peak = Math.max(...points.map((p) => p.score));
		// 8mm of rain in three weeks onto soil at 0.07 m3/m3 means very little
		// breeding habitat, so heat alone must not drive the score up.
		expect(peak).toBeLessThan(30);
		expect(points.some((p) => p.weather.temperatureC > 35)).toBe(true);
	});

	it('produces a finite score for every hour', () => {
		const { points } = assess(forecast, 'auto');
		expect(points).toHaveLength(504);
		expect(points.every((p) => Number.isFinite(p.score) && p.score >= 0 && p.score <= 100)).toBe(
			true
		);
	});
});

describe('calibration across real climates', () => {
	// Both fixtures are the same three weeks of August. New Orleans is hot and
	// repeatedly wet; Budapest is hot and bone dry. A model that cannot separate
	// these two is not measuring anything useful, so this is the guard on the
	// breeding calibration.
	const wet = assess(normalize(neworleans as never), 'auto');
	const dry = assess(normalize(budapest as never), 'auto');

	const peak = (a: typeof wet) => Math.max(...a.points.map((p) => p.score));
	const peakPop = (a: typeof wet) => Math.max(...a.points.map((p) => p.population));

	it('builds a far larger population in the wet subtropics than the dry continent', () => {
		expect(peakPop(wet)).toBeGreaterThan(0.4);
		expect(peakPop(dry)).toBeLessThan(0.25);
		expect(peakPop(wet)).toBeGreaterThan(peakPop(dry) * 3);
	});

	it('scores the wet climate materially higher', () => {
		expect(peak(wet)).toBeGreaterThan(peak(dry) * 2);
		expect(peak(wet)).toBeGreaterThan(20);
	});

	it('still finds the dry hot climate mostly harmless', () => {
		expect(peak(dry)).toBeLessThan(25);
	});

	it('never lets an ordinary breezy evening zero out a real population', () => {
		// New Orleans has evenings forecast at 18-22 km/h. Those should be damped,
		// not erased — people are bitten on breezy evenings all the time.
		const breezy = wet.points.filter((p) => p.weather.windKmh >= 18 && p.population > 0.3);
		expect(breezy.length).toBeGreaterThan(0);
		expect(breezy.some((p) => p.activity.wind > 0)).toBe(true);
	});
});
