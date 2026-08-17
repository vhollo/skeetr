import { planForWindow, sourceReduction, startTimeFor, type Setting } from './countermeasures';
import { bandLabel } from './risk';
import type { Cohort, ProtectWindow, RiskPoint } from './types';

/**
 * Converts protect windows into concrete alerts with a fire time.
 *
 * This module is deliberately pure and platform-free: the same output feeds the
 * in-page timer, the service worker, and the calendar feed. If real web push is
 * ever added, this is the only thing that needs to move to a server.
 */

export interface Alert {
	/** Stable across recomputation, so a dismissal sticks. */
	id: string;
	/** When to notify, epoch ms. */
	fireAt: number;
	/** When the risk itself starts. */
	exposureAt: number;
	title: string;
	body: string;
	score: number;
	band: number;
	kind: 'protect' | 'source-reduction';
}

export interface ScheduleOptions {
	setting: Setting;
	now?: number;
	/** Suppress alerts for windows below this band. */
	minBand?: number;
	/** Do not fire between these local hours (inclusive start, exclusive end). */
	quietHours?: { start: number; end: number } | null;
	timezone?: string;
	horizonDays?: number;
}

export function buildAlerts(
	windows: ProtectWindow[],
	points: RiskPoint[],
	cohorts: Cohort[],
	options: ScheduleOptions
): Alert[] {
	const {
		setting,
		now = Date.now(),
		minBand = 2,
		quietHours = null,
		timezone,
		horizonDays = 7
	} = options;

	const horizon = now + horizonDays * 86_400_000;
	const alerts: Alert[] = [];

	for (const window of windows) {
		if (window.peakBand < minBand) continue;
		if (window.start > horizon) continue;

		const actions = planForWindow(window, points, setting);
		if (actions.length === 0) continue;

		// Fire early enough for the slowest action in the plan, so a single
		// notification is actionable rather than already late.
		const lead = Math.max(...actions.map((a) => a.leadMinutes));
		const fireAt = startTimeFor({ ...actions[0], leadMinutes: lead }, window.start);

		if (fireAt < now) continue;
		if (quietHours && inQuietHours(fireAt, quietHours, timezone)) continue;

		const headline = actions[0];
		alerts.push({
			id: `protect-${window.start}`,
			fireAt,
			exposureAt: window.start,
			title: `${bandLabel(window.peakBand)} mosquito risk from ${formatTime(window.start, timezone)}`,
			body:
				lead > 0
					? `${headline.title} — start now, ${lead} min before it picks up.`
					: headline.title,
			score: window.peakScore,
			band: window.peakBand,
			kind: 'protect'
		});
	}

	const advice = sourceReduction(cohorts, now);
	if (advice) {
		// Nudge in the morning, when going outside to tip out buckets is realistic.
		const fireAt = nextMorning(now, 9, timezone);
		if (fireAt <= horizon) {
			alerts.push({
				id: `source-${Math.floor(fireAt / 86_400_000)}`,
				fireAt,
				exposureAt: fireAt + advice.daysAway * 86_400_000,
				title:
					advice.daysAway <= 1
						? 'A new batch of mosquitoes emerges tomorrow'
						: `A new batch emerges in about ${advice.daysAway} days`,
				body: advice.title + ' — ' + (advice.because ?? ''),
				score: 0,
				band: 2,
				kind: 'source-reduction'
			});
		}
	}

	return alerts.sort((a, b) => a.fireAt - b.fireAt);
}

function hourInZone(time: number, timezone?: string): number {
	if (!timezone) return new Date(time).getHours();
	const formatted = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		hour12: false
	}).format(time);
	return Number(formatted);
}

export function inQuietHours(
	time: number,
	quiet: { start: number; end: number },
	timezone?: string
): boolean {
	const hour = hourInZone(time, timezone);
	// Quiet periods normally wrap midnight (e.g. 22 -> 7).
	return quiet.start <= quiet.end
		? hour >= quiet.start && hour < quiet.end
		: hour >= quiet.start || hour < quiet.end;
}

function nextMorning(now: number, targetHour: number, timezone?: string): number {
	const hour = hourInZone(now, timezone);
	const msIntoHour = now % 3_600_000;
	let delta = (targetHour - hour) * 3_600_000 - msIntoHour;
	if (delta <= 0) delta += 86_400_000;
	return now + delta;
}

export function formatTime(time: number, timezone?: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(time);
}
