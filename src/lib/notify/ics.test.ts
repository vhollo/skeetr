import { describe, expect, it } from 'vitest';
import { rainOn, synthForecast } from '$lib/model/__fixtures__/synth';
import { assess, futurePoints, protectWindows } from '$lib/model/risk';
import { buildIcs, foldLine } from './ics';

const forecast = synthForecast({
	days: 30,
	meanTempC: 25,
	soilMoisture: 0.35,
	rain: { ...rainOn(1), ...rainOn(3) }
});
const assessment = assess(forecast, 'culex');
const now = forecast.hours[20 * 24].time;
const points = futurePoints(assessment.points, now);
const windows = protectWindows(points);

function build(overrides = {}) {
	return buildIcs({
		windows,
		points,
		setting: 'outdoor',
		placeName: 'Test Lake',
		origin: 'https://example.test',
		...overrides
	});
}

describe('calendar feed', () => {
	const ics = build();

	it('is a well-formed calendar with CRLF endings', () => {
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
		expect(ics.split('\r\n').length).toBeGreaterThan(10);
		// Every line must terminate with CRLF, never a bare LF.
		expect(/[^\r]\n/.test(ics)).toBe(false);
	});

	it('pairs every event with its end and closes every block', () => {
		const count = (token: string) => ics.split(token).length - 1;
		expect(count('BEGIN:VEVENT')).toBe(count('END:VEVENT'));
		expect(count('BEGIN:VALARM')).toBe(count('END:VALARM'));
		expect(count('BEGIN:VEVENT')).toBeGreaterThan(0);
	});

	it('sets an alarm at the lead time so the phone warns you early', () => {
		const triggers = [...ics.matchAll(/TRIGGER:-PT(\d+)M/g)].map((m) => Number(m[1]));
		expect(triggers.length).toBeGreaterThan(0);
		// Must actually be ahead of the event, not on it.
		expect(triggers.every((minutes) => minutes > 0)).toBe(true);
	});

	it('escapes commas and newlines rather than breaking the format', () => {
		expect(ics).toMatch(/DESCRIPTION:/);
		// A raw comma inside DESCRIPTION would split the property value.
		const description = ics.split('DESCRIPTION:')[1].split('\r\n')[0];
		expect(description.includes(',')).toBe(false);
	});

	it('never leaves a run of blank lines in the description', () => {
		expect(ics).not.toMatch(/\\n\\n\\n/);
	});

	it('respects the minimum band', () => {
		const everything = build({ minBand: 1 });
		const severeOnly = build({ minBand: 4 });
		const count = (text: string) => text.split('BEGIN:VEVENT').length - 1;
		expect(count(severeOnly)).toBeLessThanOrEqual(count(everything));
	});

	it('produces an empty but valid calendar when nothing is worth an alert', () => {
		const quiet = buildIcs({
			windows: [],
			points: [],
			setting: 'outdoor',
			placeName: 'Nowhere'
		});
		expect(quiet).toContain('BEGIN:VCALENDAR');
		expect(quiet).toContain('END:VCALENDAR');
		expect(quiet).not.toContain('BEGIN:VEVENT');
	});
});

describe('line folding', () => {
	it('leaves short lines alone', () => {
		expect(foldLine('SUMMARY:Short')).toEqual(['SUMMARY:Short']);
	});

	it('folds long lines to 75 octets with a leading space on continuations', () => {
		const folded = foldLine('DESCRIPTION:' + 'a'.repeat(300));
		expect(folded.length).toBeGreaterThan(1);
		expect(folded[0].length).toBeLessThanOrEqual(75);
		expect(folded.slice(1).every((line) => line.startsWith(' '))).toBe(true);
	});

	it('counts octets, not characters, so accents do not overflow', () => {
		const folded = foldLine('SUMMARY:' + 'é'.repeat(80));
		const bytes = (value: string) => new TextEncoder().encode(value).length;
		expect(folded.every((line) => bytes(line) <= 75)).toBe(true);
	});
});
