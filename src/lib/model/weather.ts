import type { Forecast, WeatherDay, WeatherHour } from './types';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const HOURLY = [
	'temperature_2m',
	'relative_humidity_2m',
	'dew_point_2m',
	'precipitation',
	'wind_speed_10m',
	'wind_gusts_10m',
	'cloud_cover',
	'soil_moisture_0_to_7cm',
	'is_day'
] as const;

const DAILY = [
	'sunrise',
	'sunset',
	'precipitation_sum',
	'temperature_2m_max',
	'temperature_2m_min'
] as const;

/**
 * The model needs history as well as forecast: cohorts are seeded by rain that
 * already fell, and their development is driven by warmth since then. Open-Meteo
 * returns both in one request, which is the main reason it is the data source.
 */
export const PAST_DAYS = 14;
export const FORECAST_DAYS = 7;

export function forecastUrl(latitude: number, longitude: number): string {
	const params = new URLSearchParams({
		latitude: latitude.toFixed(4),
		longitude: longitude.toFixed(4),
		hourly: HOURLY.join(','),
		daily: DAILY.join(','),
		past_days: String(PAST_DAYS),
		forecast_days: String(FORECAST_DAYS),
		timezone: 'auto',
		timeformat: 'unixtime',
		wind_speed_unit: 'kmh',
		precipitation_unit: 'mm',
		temperature_unit: 'celsius'
	});
	return `${ENDPOINT}?${params}`;
}

interface RawResponse {
	latitude: number;
	longitude: number;
	timezone: string;
	elevation: number;
	utc_offset_seconds: number;
	hourly: Record<string, (number | null)[]>;
	daily: Record<string, (number | null)[]>;
}

/** Turns the column-oriented Open-Meteo payload into row-oriented model input. */
export function normalize(raw: RawResponse, fetchedAt = Date.now()): Forecast {
	const h = raw.hourly;
	const times = h.time ?? [];

	const hours: WeatherHour[] = times.map((t, i) => ({
		time: (t ?? 0) * 1000,
		temperatureC: num(h.temperature_2m?.[i]),
		humidityPct: num(h.relative_humidity_2m?.[i]),
		dewPointC: num(h.dew_point_2m?.[i]),
		precipitationMm: num(h.precipitation?.[i]),
		windKmh: num(h.wind_speed_10m?.[i]),
		gustKmh: num(h.wind_gusts_10m?.[i]),
		cloudCoverPct: num(h.cloud_cover?.[i]),
		soilMoisture: h.soil_moisture_0_to_7cm?.[i] ?? undefined,
		isDay: (h.is_day?.[i] ?? 0) === 1
	}));

	const d = raw.daily;
	const dayTimes = d.time ?? [];
	const days: WeatherDay[] = dayTimes.map((t, i) => ({
		date: (t ?? 0) * 1000,
		sunrise: num(d.sunrise?.[i]) * 1000,
		sunset: num(d.sunset?.[i]) * 1000,
		precipitationSumMm: num(d.precipitation_sum?.[i]),
		tempMaxC: num(d.temperature_2m_max?.[i]),
		tempMinC: num(d.temperature_2m_min?.[i])
	}));

	return {
		latitude: raw.latitude,
		longitude: raw.longitude,
		timezone: raw.timezone,
		elevation: raw.elevation,
		hours,
		days,
		fetchedAt
	};
}

function num(value: number | null | undefined): number {
	return value == null || Number.isNaN(value) ? 0 : value;
}

export async function fetchForecast(
	latitude: number,
	longitude: number,
	fetchImpl: typeof fetch = fetch
): Promise<Forecast> {
	const response = await fetchImpl(forecastUrl(latitude, longitude));
	if (!response.ok) {
		throw new Error(`Open-Meteo responded ${response.status}`);
	}
	return normalize((await response.json()) as RawResponse);
}
