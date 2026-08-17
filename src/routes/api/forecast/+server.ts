import { error, json } from '@sveltejs/kit';
import { getStore } from '@netlify/blobs';
import { forecastUrl, normalize } from '$lib/model/weather';
import type { Forecast } from '$lib/model/types';
import type { RequestHandler } from './$types';

/**
 * Proxies Open-Meteo and caches the normalised result in Netlify Blobs.
 *
 * Caching on a coarse coordinate grid means everyone in the same town shares one
 * upstream call, which keeps us comfortably inside Open-Meteo's free-tier limits
 * and makes a cold load fast. The forecast only updates hourly upstream, so a
 * one-hour TTL loses nothing.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;
/** ~1.1 km grid. Fine enough for weather, coarse enough to actually share hits. */
const GRID = 100;

function cacheKey(latitude: number, longitude: number): string {
	const lat = Math.round(latitude * GRID) / GRID;
	const lon = Math.round(longitude * GRID) / GRID;
	const hour = Math.floor(Date.now() / CACHE_TTL_MS);
	return `v1/${lat},${lon}/${hour}`;
}

export const GET: RequestHandler = async ({ url, fetch, setHeaders }) => {
	const latitude = Number(url.searchParams.get('lat'));
	const longitude = Number(url.searchParams.get('lon'));

	if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
		error(400, 'lat must be a number between -90 and 90');
	}
	if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
		error(400, 'lon must be a number between -180 and 180');
	}

	const key = cacheKey(latitude, longitude);
	const store = safeStore();

	if (store) {
		try {
			const hit = (await store.get(key, { type: 'json' })) as Forecast | null;
			if (hit) {
				setHeaders({ 'cache-control': 'public, max-age=900', 'x-cache': 'hit' });
				return json(hit);
			}
		} catch {
			// A cache miss must never be fatal — fall through to the upstream call.
		}
	}

	const response = await fetch(forecastUrl(latitude, longitude));
	if (!response.ok) {
		error(502, `Weather service responded ${response.status}`);
	}

	const forecast = normalize(await response.json());

	if (store) {
		try {
			await store.setJSON(key, forecast);
		} catch {
			// Losing the write just means the next request pays for it again.
		}
	}

	setHeaders({ 'cache-control': 'public, max-age=900', 'x-cache': 'miss' });
	return json(forecast);
};

/** Blobs is unavailable in plain `vite dev`; the route must still work there. */
function safeStore() {
	try {
		return getStore({ name: 'forecast-cache', consistency: 'eventual' });
	} catch {
		return null;
	}
}
