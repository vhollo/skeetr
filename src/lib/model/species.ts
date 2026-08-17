/**
 * Species profiles. These change *when* mosquitoes bite and *how fast* a cohort
 * matures — not the underlying model structure.
 */

export type SpeciesId = 'auto' | 'culex' | 'aedes';

export interface SpeciesProfile {
	id: Exclude<SpeciesId, 'auto'>;
	label: string;
	/** One-line description shown in Settings. */
	blurb: string;
	/** Accumulated degree-days above base required for egg -> biting adult. */
	degreeDaysToAdult: number;
	/** Baseline activity at solar noon, relative to the crepuscular peak. */
	daytimeBaseline: number;
	/** Baseline activity in the middle of the night. */
	nightBaseline: number;
	/** Relative height of the dawn peak against the dusk peak. */
	dawnPeakRatio: number;
}

const CULEX: SpeciesProfile = {
	id: 'culex',
	label: 'Culex (night-biting)',
	blurb:
		'House mosquito. Breeds in stagnant ground water, ditches and water butts. Bites from dusk through the night, rarely in daylight.',
	degreeDaysToAdult: 145,
	daytimeBaseline: 0.06,
	nightBaseline: 0.55,
	dawnPeakRatio: 0.7
};

const AEDES: SpeciesProfile = {
	id: 'aedes',
	label: 'Aedes (day-biting, urban)',
	blurb:
		'Tiger mosquito. Breeds in small containers — saucers, tyres, gutters. Bites through the day with a hard peak at dusk, and will follow you indoors.',
	degreeDaysToAdult: 125,
	daytimeBaseline: 0.42,
	nightBaseline: 0.12,
	dawnPeakRatio: 0.85
};

export const PROFILES: Record<Exclude<SpeciesId, 'auto'>, SpeciesProfile> = {
	culex: CULEX,
	aedes: AEDES
};

/**
 * `auto` resolution. Aedes albopictus is established around the Mediterranean and
 * has spread well into central Europe and the southern US; north of roughly 50 deg
 * Culex still dominates the biting pressure people actually notice.
 *
 * This is a coarse heuristic and the UI lets the user override it.
 */
export function resolveSpecies(id: SpeciesId, latitude: number): SpeciesProfile {
	if (id !== 'auto') return PROFILES[id];
	return Math.abs(latitude) <= 48 ? AEDES : CULEX;
}
