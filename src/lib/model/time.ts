/**
 * Timezone helpers for planning a trip somewhere other than where you are.
 *
 * A `datetime-local` input yields a wall-clock string with no zone. When someone
 * plans an evening in another timezone they mean the local time *there* — a
 * lakeside evening at 19:30 is 19:30 by the lake, not 19:30 back home. Parsing
 * it with `Date.parse` silently applies the device's zone and shifts the whole
 * window, which is how you end up assessing lunchtime instead of dusk.
 */

/** Offset in ms between a zone's local time and UTC at a given instant. */
function offsetAt(utcMs: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(utcMs);

	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

	const asIfUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		// Intl can render midnight as hour 24 in some locales.
		get('hour') % 24,
		get('minute'),
		get('second')
	);

	return asIfUtc - utcMs;
}

/**
 * Converts a wall-clock string ("2026-08-19T19:30") in `timeZone` to epoch ms.
 * Returns NaN if the input is unparseable.
 */
export function zonedToEpoch(localIso: string, timeZone: string): number {
	const withSeconds = localIso.length === 16 ? `${localIso}:00` : localIso;
	const naive = Date.parse(`${withSeconds}Z`);
	if (Number.isNaN(naive)) return NaN;

	// One pass gets close; a second settles the case where the first guess landed
	// on the other side of a daylight-saving transition.
	const first = naive - offsetAt(naive, timeZone);
	return naive - offsetAt(first, timeZone);
}

/** Formats an instant as a wall clock in the given zone. */
export function formatInZone(
	time: number,
	timeZone: string,
	options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(time);
}
