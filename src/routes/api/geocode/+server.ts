import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Place search for saved places and planned trips. Open-Meteo's geocoder, keyless. */

export interface GeoResult {
	id: number;
	name: string;
	country: string;
	admin1?: string;
	latitude: number;
	longitude: number;
	timezone: string;
}

export const GET: RequestHandler = async ({ url, fetch, setHeaders }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length < 2) return json({ results: [] as GeoResult[] });

	const params = new URLSearchParams({
		name: query,
		count: '8',
		language: 'en',
		format: 'json'
	});

	const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
	if (!response.ok) error(502, `Geocoder responded ${response.status}`);

	const body = (await response.json()) as { results?: GeoResult[] };
	setHeaders({ 'cache-control': 'public, max-age=86400' });

	return json({
		results: (body.results ?? []).map((r) => ({
			id: r.id,
			name: r.name,
			country: r.country,
			admin1: r.admin1,
			latitude: r.latitude,
			longitude: r.longitude,
			timezone: r.timezone
		}))
	});
};
