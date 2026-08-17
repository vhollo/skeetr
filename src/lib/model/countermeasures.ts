import { HOUR_MS } from './curves';
import { pendingCohorts } from './cohorts';
import type { Cohort, ProtectWindow, RiskPoint } from './types';

/**
 * Turns a risk window into a timed action plan.
 *
 * The central idea: countermeasures are not instantaneous. A repellent needs to
 * be on your skin before you walk outside, and a plug-in vaporiser needs to
 * saturate a room before you sit in it. Every action therefore carries a lead
 * time, and the app schedules backwards from the moment risk actually starts.
 *
 * Advice is deliberately generic by active ingredient. Dosage, age limits and
 * pregnancy guidance are label matters and the UI says so.
 */

export type ActionId =
	| 'topical-repellent'
	| 'indoor-vaporiser'
	| 'spatial-repellent'
	| 'fan'
	| 'screens'
	| 'cover-up'
	| 'source-reduction';

export interface TimedAction {
	id: ActionId;
	title: string;
	detail: string;
	/** Minutes before exposure this must be started. */
	leadMinutes: number;
	/** How long the protection lasts, minutes. 0 = for as long as it runs. */
	durationMinutes: number;
	/** Lower sorts first. */
	priority: number;
	/** Shown when an action is offered specifically because of conditions. */
	because?: string;
}

export type Setting = 'outdoor' | 'indoor';

export interface PlanContext {
	/** When the user will be exposed. */
	exposureStart: number;
	setting: Setting;
	/** Conditions at the start of exposure, used to suppress useless advice. */
	windKmh: number;
	band: number;
	score: number;
}

const TOPICAL: TimedAction = {
	id: 'topical-repellent',
	title: 'Apply repellent to exposed skin',
	detail:
		'DEET (20–30%) or icaridin/picaridin (20%) on skin that will stay uncovered. Icaridin is less greasy and will not damage plastics or synthetic fabric. Follow the label for reapplication and for children.',
	leadMinutes: 20,
	durationMinutes: 6 * 60,
	priority: 1
};

const VAPORISER: TimedAction = {
	id: 'indoor-vaporiser',
	title: 'Switch on the plug-in vaporiser',
	detail:
		'A pyrethroid mat or liquid vaporiser needs time to build up in the air. Start it before you settle in the room, with windows shut, then ventilate before sleeping if the room is small.',
	leadMinutes: 45,
	durationMinutes: 0,
	priority: 2
};

const SPATIAL: TimedAction = {
	id: 'spatial-repellent',
	title: 'Light the coil or start the clip-on diffuser',
	detail:
		'Metofluthrin or transfluthrin diffusers hold a protected pocket of air around a seating area. They need still air and a little time to establish.',
	leadMinutes: 25,
	durationMinutes: 0,
	priority: 3
};

const FAN: TimedAction = {
	id: 'fan',
	title: 'Point a fan at the seating area',
	detail:
		'Moving air is the single most reliable outdoor measure: it grounds weak-flying mosquitoes and disperses the carbon dioxide plume they home in on. Works instantly and costs nothing to try.',
	leadMinutes: 0,
	durationMinutes: 0,
	priority: 2
};

const SCREENS: TimedAction = {
	id: 'screens',
	title: 'Close windows and screens before dusk',
	detail:
		'Shut up the house ahead of the dusk peak, before they come to the lit windows. Cheaper than dealing with them once they are inside.',
	leadMinutes: 30,
	durationMinutes: 0,
	priority: 1
};

const COVER_UP: TimedAction = {
	id: 'cover-up',
	title: 'Cover up — long sleeves, ankles, loose weave',
	detail:
		'Ankles and wrists take most bites. Loose clothing beats tight: they bite through anything stretched against skin.',
	leadMinutes: 5,
	durationMinutes: 0,
	priority: 4
};

/**
 * Above roughly this reported 10 m wind, a coil or diffuser's vapour is carried
 * off before it can build up around a seating area. Recommending one in a breeze
 * wastes the user's money, so the plan swaps to a fan and says why.
 */
const SPATIAL_MAX_WIND_KMH = 13;

export function planFor(context: PlanContext): TimedAction[] {
	const { band, setting, windKmh } = context;
	if (band <= 0) return [];

	const actions: TimedAction[] = [];

	if (setting === 'indoor') {
		actions.push(SCREENS);
		if (band >= 2) actions.push(VAPORISER);
		if (band >= 3) actions.push({ ...TOPICAL, detail: `${TOPICAL.detail} Worth it indoors too once they are in the room.` });
	} else {
		if (band >= 1) actions.push(TOPICAL);
		if (band >= 2) {
			const tooWindyForVapour = windKmh > SPATIAL_MAX_WIND_KMH;
			actions.push(
				tooWindyForVapour
					? {
							...FAN,
							because: `Skipping the coil — at ${Math.round(windKmh)} km/h the vapour blows away before it can build up. The moving air is doing that job anyway.`
						}
					: FAN
			);
			if (!tooWindyForVapour) actions.push(SPATIAL);
		}
		if (band >= 3) actions.push(COVER_UP);
	}

	// De-duplicate by id, keeping the first (richest) entry, then order by urgency.
	const seen = new Set<ActionId>();
	return actions
		.filter((action) => (seen.has(action.id) ? false : (seen.add(action.id), true)))
		.sort((a, b) => a.priority - b.priority || b.leadMinutes - a.leadMinutes);
}

/** The instant an action must be started for a given exposure. */
export function startTimeFor(action: TimedAction, exposureStart: number): number {
	return exposureStart - action.leadMinutes * 60_000;
}

/** Builds the plan for a protect window, reading conditions from the risk series. */
export function planForWindow(
	window: ProtectWindow,
	points: RiskPoint[],
	setting: Setting
): TimedAction[] {
	const atStart = points.find((p) => p.time >= window.start - HOUR_MS) ?? points[0];
	return planFor({
		exposureStart: window.start,
		setting,
		windKmh: atStart?.weather.windKmh ?? 0,
		band: window.peakBand,
		score: window.peakScore
	});
}

/**
 * The preventive half of the app: a cohort still developing is a warning you can
 * act on days ahead, which is the one thing tipping out standing water can
 * actually change. Driven by the population layer, not by tonight's weather.
 */
export interface SourceReductionAdvice extends TimedAction {
	/** Estimated days until this cohort starts biting. */
	daysAway: number;
	rainMm: number;
}

export function sourceReduction(
	cohorts: Cohort[],
	now: number,
	horizonDays = 7
): SourceReductionAdvice | null {
	const pending = pendingCohorts(cohorts, now).filter((c) => c.rainMm >= 5);
	if (pending.length === 0) return null;

	// The most developed pending cohort is the one about to land.
	const soonest = pending[0];
	const daysSince = (now - soonest.startedAt) / 86_400_000;
	if (daysSince <= 0) return null;

	// Prefer the known emergence time when the forecast already reaches it;
	// otherwise extrapolate from the development rate observed so far.
	let daysAway: number;
	if (soonest.emergedAt != null) {
		daysAway = (soonest.emergedAt - now) / 86_400_000;
	} else {
		const rate = soonest.progress / daysSince;
		if (rate <= 0) return null;
		daysAway = (1 - soonest.progress) / rate;
	}
	if (daysAway > horizonDays) return null;

	return {
		id: 'source-reduction',
		title: 'Tip out standing water now',
		detail:
			'Saucers, buckets, tyres, watering cans, blocked gutters, tarpaulin folds. Larvae from this batch are still in the water, so emptying it now removes them before they fly. Once they emerge it is too late for this batch.',
		leadMinutes: 0,
		durationMinutes: 0,
		priority: 0,
		because: `${soonest.rainMm.toFixed(0)} mm of rain ${Math.round(daysSince)} days ago seeded a batch that is ${Math.round(soonest.progress * 100)}% developed.`,
		daysAway: Math.max(0, Math.round(daysAway)),
		rainMm: soonest.rainMm
	};
}
