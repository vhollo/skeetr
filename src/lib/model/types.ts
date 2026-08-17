/** Shared model types. */

export interface Place {
	id: string;
	name: string;
	latitude: number;
	longitude: number;
	/** IANA zone, as reported by Open-Meteo for the coordinates. */
	timezone: string;
}

/** One normalised hour of weather. */
export interface WeatherHour {
	/** Epoch milliseconds, UTC. */
	time: number;
	temperatureC: number;
	humidityPct: number;
	dewPointC: number;
	precipitationMm: number;
	windKmh: number;
	gustKmh: number;
	cloudCoverPct: number;
	/** Volumetric soil moisture 0-7cm, m3/m3. Undefined if the model lacks it. */
	soilMoisture?: number;
	isDay: boolean;
}

export interface WeatherDay {
	/** Epoch ms at local midnight. */
	date: number;
	sunrise: number;
	sunset: number;
	precipitationSumMm: number;
	tempMaxC: number;
	tempMinC: number;
}

export interface Forecast {
	latitude: number;
	longitude: number;
	timezone: string;
	elevation: number;
	/** Past days first, then future. Contiguous, hourly, ascending. */
	hours: WeatherHour[];
	days: WeatherDay[];
	/** When this was fetched, epoch ms. */
	fetchedAt: number;
}

/** A flooding event that started a batch of eggs developing. */
export interface Cohort {
	/** Epoch ms of the hour the event ended. */
	startedAt: number;
	rainMm: number;
	/** 0..1 relative size at formation. */
	mass: number;
	/** Epoch ms when accumulated degree-days crossed the threshold, if reached. */
	emergedAt?: number;
	/** Degree-days accumulated so far since startedAt. */
	degreeDays: number;
	/** Fraction of the threshold reached, 0..1. */
	progress: number;
}

/** Per-hour breakdown of the activity multiplier, for the Why screen. */
export interface ActivityFactors {
	temperature: number;
	wind: number;
	rain: number;
	humidity: number;
	diel: number;
	/** Product of the above, 0..1. */
	total: number;
}

export interface RiskPoint {
	time: number;
	/** 0..100. */
	score: number;
	band: number;
	/** 0..1 standing adult population index at this hour. */
	population: number;
	activity: ActivityFactors;
	weather: WeatherHour;
}

export interface ProtectWindow {
	start: number;
	end: number;
	/** Highest score inside the window. */
	peakScore: number;
	peakBand: number;
	peakTime: number;
}
