import { describe, expect, it } from 'vitest';
import { formatInZone, zonedToEpoch } from './time';

describe('zoned wall-clock parsing', () => {
	it('reads a time as local to the given zone, not to this machine', () => {
		// 19:30 in Chicago is 00:30 UTC the next day (CDT, UTC-5) in August.
		const chicago = zonedToEpoch('2026-08-19T19:30', 'America/Chicago');
		expect(new Date(chicago).toISOString()).toBe('2026-08-20T00:30:00.000Z');

		// The same wall clock in Budapest (CEST, UTC+2) is a different instant.
		const budapest = zonedToEpoch('2026-08-19T19:30', 'Europe/Budapest');
		expect(new Date(budapest).toISOString()).toBe('2026-08-19T17:30:00.000Z');

		expect(chicago).not.toBe(budapest);
		expect((chicago - budapest) / 3_600_000).toBe(7);
	});

	it('round-trips through the formatter', () => {
		for (const zone of ['America/Chicago', 'Europe/Budapest', 'Asia/Tokyo', 'UTC']) {
			const epoch = zonedToEpoch('2026-08-19T19:30', zone);
			expect(formatInZone(epoch, zone)).toBe('19:30');
		}
	});

	it('handles zones with a half-hour offset', () => {
		const kolkata = zonedToEpoch('2026-08-19T19:30', 'Asia/Kolkata');
		expect(new Date(kolkata).toISOString()).toBe('2026-08-19T14:00:00.000Z');
	});

	it('handles a winter date on the other side of a daylight-saving change', () => {
		const winter = zonedToEpoch('2026-01-15T19:30', 'America/Chicago');
		// CST, UTC-6.
		expect(new Date(winter).toISOString()).toBe('2026-01-16T01:30:00.000Z');
		expect(formatInZone(winter, 'America/Chicago')).toBe('19:30');
	});

	it('accepts a value that already carries seconds', () => {
		expect(zonedToEpoch('2026-08-19T19:30:00', 'UTC')).toBe(
			zonedToEpoch('2026-08-19T19:30', 'UTC')
		);
	});

	it('reports unparseable input rather than guessing', () => {
		expect(Number.isNaN(zonedToEpoch('not a date', 'UTC'))).toBe(true);
	});
});
