import { describe, expect, it } from 'vitest';
import { rainOn, synthForecast } from './__fixtures__/synth';
import { planFor, planForWindow, sourceReduction, startTimeFor } from './countermeasures';
import { assess, protectWindows } from './risk';
import { buildAlerts, inQuietHours } from './schedule';

describe('countermeasure plans', () => {
	const base = { exposureStart: Date.UTC(2026, 5, 20, 19), windKmh: 3, score: 60, band: 3 };

	it('recommends nothing when there is no risk', () => {
		expect(planFor({ ...base, band: 0, score: 2, setting: 'outdoor' })).toEqual([]);
	});

	it('leads with repellent outdoors and screens indoors', () => {
		const outdoor = planFor({ ...base, setting: 'outdoor' });
		const indoor = planFor({ ...base, setting: 'indoor' });

		expect(outdoor[0].id).toBe('topical-repellent');
		expect(indoor.map((a) => a.id)).toContain('screens');
		expect(indoor.map((a) => a.id)).toContain('indoor-vaporiser');
	});

	it('does not recommend a coil in wind, and explains why', () => {
		const calm = planFor({ ...base, setting: 'outdoor', windKmh: 4 });
		const breezy = planFor({ ...base, setting: 'outdoor', windKmh: 15 });

		expect(calm.map((a) => a.id)).toContain('spatial-repellent');
		expect(breezy.map((a) => a.id)).not.toContain('spatial-repellent');
		expect(breezy.find((a) => a.because)?.because).toMatch(/blows away/i);
	});

	it('escalates with the risk band', () => {
		const low = planFor({ ...base, band: 1, score: 12, setting: 'outdoor' });
		const severe = planFor({ ...base, band: 4, score: 90, setting: 'outdoor' });
		expect(severe.length).toBeGreaterThan(low.length);
		expect(severe.map((a) => a.id)).toContain('cover-up');
	});

	it('schedules backwards from exposure by the action lead time', () => {
		const [action] = planFor({ ...base, setting: 'outdoor' });
		const start = startTimeFor(action, base.exposureStart);
		expect(base.exposureStart - start).toBe(action.leadMinutes * 60_000);
		expect(action.leadMinutes).toBeGreaterThan(0);
	});

	it('never returns duplicate actions', () => {
		const actions = planFor({ ...base, band: 4, setting: 'outdoor', windKmh: 20 });
		const ids = actions.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('source reduction advice', () => {
	// Rain on day 1 at 24C seeds a batch that emerges on day ~12.3.
	const forecast = synthForecast({ days: 20, meanTempC: 24, rain: rainOn(1) });
	const { cohorts } = assess(forecast, 'culex');
	const onDay = (day: number) => forecast.hours[day * 24].time;

	it('warns ahead of a developing cohort while there is still time to act', () => {
		// Day 6: the batch is part-grown, still in the water, and inside the horizon.
		const advice = sourceReduction(cohorts, onDay(6));
		expect(advice).not.toBeNull();
		expect(advice!.daysAway).toBeGreaterThan(0);
		expect(advice!.daysAway).toBeLessThanOrEqual(7);
		expect(advice!.because).toMatch(/mm of rain/);
	});

	it('counts down as the batch develops', () => {
		const six = sourceReduction(cohorts, onDay(6))!;
		const nine = sourceReduction(cohorts, onDay(9))!;
		expect(nine.daysAway).toBeLessThan(six.daysAway);
	});

	it('stays quiet while the batch is still beyond the advice horizon', () => {
		// Day 3 is over a week from emergence — too early to be actionable.
		expect(sourceReduction(cohorts, onDay(3))).toBeNull();
	});

	it('stops advising once the batch has already emerged', () => {
		// Day 14: they are flying. Tipping out water no longer helps this batch.
		expect(sourceReduction(cohorts, onDay(14))).toBeNull();
	});

	it('says nothing when no meaningful batch is developing', () => {
		const forecast = synthForecast({ days: 20, meanTempC: 24 });
		const { cohorts } = assess(forecast, 'culex');
		expect(sourceReduction(cohorts, forecast.hours[10 * 24].time)).toBeNull();
	});
});

describe('alert scheduling', () => {
	const forecast = synthForecast({
		days: 30,
		meanTempC: 25,
		soilMoisture: 0.35,
		rain: { ...rainOn(1), ...rainOn(3) }
	});
	const assessment = assess(forecast, 'culex');
	const now = forecast.hours[20 * 24].time;
	const future = assessment.points.filter((p) => p.time >= now);
	const windows = protectWindows(future);

	it('fires before the risk starts, with enough lead for the slowest action', () => {
		const alerts = buildAlerts(windows, future, assessment.cohorts, {
			setting: 'outdoor',
			now,
			timezone: 'UTC'
		});

		expect(alerts.length).toBeGreaterThan(0);
		for (const alert of alerts.filter((a) => a.kind === 'protect')) {
			expect(alert.fireAt).toBeLessThan(alert.exposureAt);
			expect(alert.fireAt).toBeGreaterThanOrEqual(now);
		}
	});

	it('is ordered by fire time and has stable ids', () => {
		const options = { setting: 'outdoor' as const, now, timezone: 'UTC' };
		const first = buildAlerts(windows, future, assessment.cohorts, options);
		const second = buildAlerts(windows, future, assessment.cohorts, options);

		expect(first.map((a) => a.id)).toEqual(second.map((a) => a.id));
		const times = first.map((a) => a.fireAt);
		expect([...times].sort((a, b) => a - b)).toEqual(times);
	});

	it('honours the minimum band', () => {
		const permissive = buildAlerts(windows, future, assessment.cohorts, {
			setting: 'outdoor',
			now,
			minBand: 1,
			timezone: 'UTC'
		});
		const strict = buildAlerts(windows, future, assessment.cohorts, {
			setting: 'outdoor',
			now,
			minBand: 4,
			timezone: 'UTC'
		});
		expect(strict.length).toBeLessThanOrEqual(permissive.length);
	});

	it('suppresses alerts inside quiet hours', () => {
		const alerts = buildAlerts(windows, future, assessment.cohorts, {
			setting: 'outdoor',
			now,
			timezone: 'UTC',
			quietHours: { start: 0, end: 23 }
		});
		expect(alerts.filter((a) => a.kind === 'protect')).toHaveLength(0);
	});
});

describe('quiet hours', () => {
	const at = (hour: number) => Date.UTC(2026, 5, 20, hour);

	it('handles a window that wraps midnight', () => {
		const quiet = { start: 22, end: 7 };
		expect(inQuietHours(at(23), quiet, 'UTC')).toBe(true);
		expect(inQuietHours(at(3), quiet, 'UTC')).toBe(true);
		expect(inQuietHours(at(12), quiet, 'UTC')).toBe(false);
		expect(inQuietHours(at(7), quiet, 'UTC')).toBe(false);
	});

	it('handles a window inside one day', () => {
		const quiet = { start: 9, end: 17 };
		expect(inQuietHours(at(12), quiet, 'UTC')).toBe(true);
		expect(inQuietHours(at(20), quiet, 'UTC')).toBe(false);
	});
});
