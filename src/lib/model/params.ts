/**
 * Every tunable constant in the risk model lives here, with a note on where the
 * value comes from. Logic modules import from this file and contain no magic
 * numbers, so the model can be recalibrated without touching any algorithm.
 *
 * These are literature-informed estimates for a generic temperate-zone container
 * and ground-pool breeding population. They are not a validated epidemiological
 * model, and the UI presents output as an estimate (see /model).
 */

/** Degree-day accumulation. */
export const DEGREE_DAY = {
	/** Development base temperature. Below this, immature development stalls.
	 *  Culex/Aedes larval development base is consistently reported near 10-11 C. */
	baseTempC: 10.5,
	/** Upper cutoff: above this, extra heat stops buying extra development
	 *  (and starts killing larvae). Standard horizontal-cutoff degree-day method. */
	ceilingTempC: 34
} as const;

/** Rain -> egg cohort formation. */
export const BREEDING = {
	/** Hourly precipitation below this is treated as noise, not a flooding event. */
	minHourlyRainMm: 0.4,
	/** A rain event is closed after this many consecutive dry hours. */
	eventGapHours: 6,
	/** Total event rainfall at or above this saturates cohort size. Beyond it,
	 *  extra water tends to flush larvae out rather than create more habitat.
	 *  Set low deliberately: containers, gutters, ditches and tyre ruts are full
	 *  after about a centimetre, and it is the number of wet containers that
	 *  limits breeding, not the depth of water in them. */
	saturatingRainMm: 12,
	/** Very heavy bursts flush existing larvae from containers and ditches.
	 *  Above this hourly intensity a penalty is applied to *existing* cohorts. */
	flushingRainMmPerHour: 12,
	/** Fraction of an existing cohort washed out by a flushing hour. */
	flushLossFraction: 0.35,
	/** Antecedent soil moisture (m3/m3) at or above which ground is already
	 *  saturated, so rain pools instead of soaking away -> better breeding. */
	saturatedSoilM3: 0.32,
	/** Dry ground absorbs; cohort size is scaled by at least this factor. */
	drySoilPenalty: 0.55,
	/** Daily cohort mass from permanent habitat that never depends on rain —
	 *  watered pots, ponds, blocked gutters, leaking taps. Deliberately small: it
	 *  is a floor so a dry fortnight in a city does not read as zero mosquitoes,
	 *  NOT a driver. Compounded against the adult half-life this settles near 0.47
	 *  standing mass, well below the ~1.0 a single soaking rain event delivers, so
	 *  rainfall remains the dominant term the model is built around. */
	baselineHabitat: 0.035
} as const;

/** Adult population dynamics. */
export const ADULT = {
	/** Half-life of an emerged adult cohort under benign conditions, in days.
	 *  Field-realistic adult survival is well below laboratory lifespan. */
	halfLifeDays: 9,
	/** Days of extra decay applied while daily max exceeds heatStressTempC. */
	heatStressTempC: 35,
	heatStressMultiplier: 2.2,
	/** A hard frost effectively ends the active adult population. */
	killingFrostTempC: -2,
	/** Standing adult mass that counts as "as bad as it gets", used to normalise
	 *  the 0..1 population index. Calibrated so a hot, wet, subtropical August —
	 *  a run of 5-15 mm rain events a few days apart — saturates, while a dry
	 *  continental summer stays well down the scale. */
	saturatingCohortMass: 1.5
} as const;

/** Hourly activity response curves. */
export const ACTIVITY = {
	temp: {
		/** No meaningful host-seeking flight below this. */
		floorC: 10,
		/** Full activity plateau. */
		optimalLowC: 24,
		optimalHighC: 28,
		/** Heat dormancy: they retreat to cool damp refuges. */
		ceilingC: 37
	},
	wind: {
		/** Below this they fly unimpeded. Near-ground wind, not the 10 m value. */
		calmKmh: 5,
		/** Above this a mosquito cannot make headway; activity collapses. */
		groundedKmh: 17,
		/**
		 * Weather models report wind at 10 m in the open, but mosquitoes and people
		 * are near the ground among buildings, hedges and furniture, where it is
		 * much calmer. This converts the reported wind to what is actually felt at
		 * biting height — roughly the standard log-law reduction over rough terrain.
		 * Without it, an ordinary breezy evening wrongly reads as no risk at all.
		 */
		tenMetreToGroundFactor: 0.6
	},
	rain: {
		/** Drizzle barely deters; this is where suppression begins. */
		lightMmPerHour: 0.3,
		/** Steady rain keeps them sheltered. */
		heavyMmPerHour: 2.5,
		/** Residual activity under heavy rain (sheltered porches, eaves). */
		floorMultiplier: 0.15
	},
	humidity: {
		/** Below this, desiccation risk suppresses flight. */
		dryPct: 40,
		/** Above this, no humidity penalty at all. */
		comfortablePct: 65,
		/** Multiplier at 0% RH. */
		floorMultiplier: 0.25
	},
	/** Crepuscular peak width, in minutes either side of sunrise/sunset. */
	diel: {
		peakHalfWidthMin: 75,
		/** Broader shoulder around the sharp peak. */
		shoulderHalfWidthMin: 210
	}
} as const;

/** Risk band thresholds on the 0-100 scale. */
export const BANDS = [
	{ id: 0, min: 0, label: 'Negligible' },
	{ id: 1, min: 8, label: 'Low' },
	{ id: 2, min: 25, label: 'Moderate' },
	{ id: 3, min: 50, label: 'High' },
	{ id: 4, min: 75, label: 'Severe' }
] as const;

/** A protect-window is a run of hours at or above this score. */
export const PROTECT_THRESHOLD = 25;
