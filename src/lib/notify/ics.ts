import { planForWindow, type Setting } from '$lib/model/countermeasures';
import type { ProtectWindow, RiskPoint } from '$lib/model/types';
import { bandLabel } from '$lib/model/risk';

/**
 * Builds an iCalendar feed of upcoming protect windows.
 *
 * This is the only notification path that reliably reaches a user whose phone is
 * in their pocket and whose app is closed, without running a push server: the
 * operating system's own calendar fires the alarms. On iOS it is the only such
 * path at all, since web push there requires both an installed PWA and a server.
 */

export interface IcsOptions {
	windows: ProtectWindow[];
	points: RiskPoint[];
	setting: Setting;
	placeName: string;
	/** Absolute base URL, used for the event link back into the app. */
	origin?: string;
	minBand?: number;
}

export function buildIcs(options: IcsOptions): string {
	const { windows, points, setting, placeName, origin, minBand = 2 } = options;

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Skeetr//Mosquito bite forecast//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeText(`Mosquito risk — ${placeName}`)}`,
		'X-WR-CALDESC:Windows when mosquito bite risk is high enough to act on.',
		// Tells subscribing clients how often to re-poll; the feed is stateless and
		// recomputed from live weather on every request.
		'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
		'X-PUBLISHED-TTL:PT6H'
	];

	for (const window of windows) {
		if (window.peakBand < minBand) continue;

		const actions = planForWindow(window, points, setting);
		if (actions.length === 0) continue;

		const lead = Math.max(...actions.map((a) => a.leadMinutes), 0);
		const notes = actions.filter((a) => a.because).map((a) => a.because!);
		const description = [
			`Peak risk ${window.peakScore}/100 (${bandLabel(window.peakBand)}).`,
			'',
			...actions.map((a) =>
				a.leadMinutes > 0 ? `• ${a.leadMinutes} min before: ${a.title}` : `• ${a.title}`
			),
			// Only open a paragraph for notes when there are any, otherwise the
			// description ends up with a run of blank lines.
			...(notes.length > 0 ? ['', ...notes] : []),
			'',
			'Follow the product label for dosage, reapplication and use on children.'
		].join('\n');

		lines.push(
			'BEGIN:VEVENT',
			`UID:skeetr-${window.start}@skeetr.app`,
			`DTSTAMP:${formatUtc(Date.now())}`,
			`DTSTART:${formatUtc(window.start)}`,
			`DTEND:${formatUtc(window.end)}`,
			`SUMMARY:${escapeText(`${bandLabel(window.peakBand)} mosquito risk — ${placeName}`)}`,
			`DESCRIPTION:${escapeText(description)}`,
			`LOCATION:${escapeText(placeName)}`,
			'TRANSP:TRANSPARENT'
		);

		if (origin) lines.push(`URL:${escapeText(origin)}`);

		if (lead > 0) {
			lines.push(
				'BEGIN:VALARM',
				'ACTION:DISPLAY',
				`TRIGGER:-PT${lead}M`,
				`DESCRIPTION:${escapeText(`${actions[0].title} — risk starts in ${lead} min`)}`,
				'END:VALARM'
			);
		}

		lines.push('END:VEVENT');
	}

	lines.push('END:VCALENDAR');

	// RFC 5545 requires CRLF line endings and lines folded at 75 octets.
	return lines.flatMap(foldLine).join('\r\n') + '\r\n';
}

function formatUtc(time: number): string {
	return new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/** Folds a content line to 75 octets, continuing with a leading space. */
export function foldLine(line: string): string[] {
	if (byteLength(line) <= 75) return [line];

	const out: string[] = [];
	let current = '';
	let limit = 75;

	for (const char of line) {
		if (byteLength(current + char) > limit) {
			out.push(current);
			current = ' ' + char;
			limit = 74;
		} else {
			current += char;
		}
	}
	if (current) out.push(current);
	return out;
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}
