import { DAY_MS, HOUR_MS } from '../curves';
import type { Forecast, WeatherDay, WeatherHour } from '../types';

/**
 * Builds deterministic synthetic weather so model behaviour can be asserted
 * against a known cause. Real fixtures prove we parse the API; these prove the
 * model responds to heat, rain and wind the way it is supposed to.
 */

export interface SynthOptions {
	days: number;
	/** Base daily mean temperature, C. */
	meanTempC: number;
	/** Half the daily swing, C. */
	amplitudeC?: number;
	humidityPct?: number;
	windKmh?: number;
	soilMoisture?: number;
	/** Rain to drop, keyed by hour index. */
	rain?: Record<number, number>;
	/** Epoch ms of the first hour. Defaults to a fixed date for reproducibility. */
	start?: number;
	latitude?: number;
}

export const SYNTH_START = Date.UTC(2026, 5, 1, 0, 0, 0);

export function synthForecast(options: SynthOptions): Forecast {
	const {
		days,
		meanTempC,
		amplitudeC = 6,
		humidityPct = 70,
		windKmh = 2,
		soilMoisture = 0.3,
		rain = {},
		start = SYNTH_START,
		latitude = 47.5
	} = options;

	const total = days * 24;
	const hours: WeatherHour[] = [];

	for (let i = 0; i < total; i++) {
		const hourOfDay = i % 24;
		// Warmest at 15:00, coolest at 03:00.
		const phase = ((hourOfDay - 15) / 24) * 2 * Math.PI;
		const temperatureC = meanTempC + amplitudeC * Math.cos(phase);
		const precipitationMm = rain[i] ?? 0;

		hours.push({
			time: start + i * HOUR_MS,
			temperatureC,
			humidityPct,
			dewPointC: temperatureC - 5,
			precipitationMm,
			windKmh,
			gustKmh: windKmh * 1.6,
			cloudCoverPct: precipitationMm > 0 ? 95 : 20,
			soilMoisture,
			isDay: hourOfDay >= 6 && hourOfDay < 20
		});
	}

	const dayRecords: WeatherDay[] = [];
	for (let d = 0; d < days; d++) {
		const date = start + d * DAY_MS;
		const slice = hours.slice(d * 24, d * 24 + 24);
		dayRecords.push({
			date,
			sunrise: date + 5 * HOUR_MS,
			sunset: date + 20 * HOUR_MS,
			precipitationSumMm: slice.reduce((sum, h) => sum + h.precipitationMm, 0),
			tempMaxC: Math.max(...slice.map((h) => h.temperatureC)),
			tempMinC: Math.min(...slice.map((h) => h.temperatureC))
		});
	}

	return {
		latitude,
		longitude: 19.04,
		timezone: 'UTC',
		elevation: 100,
		hours,
		days: dayRecords,
		fetchedAt: start
	};
}

/** A single soaking rain event on day `day`, 4 hours long. */
export function rainOn(day: number, mmPerHour = 6): Record<number, number> {
	const out: Record<number, number> = {};
	for (let h = 0; h < 4; h++) out[day * 24 + 10 + h] = mmPerHour;
	return out;
}
