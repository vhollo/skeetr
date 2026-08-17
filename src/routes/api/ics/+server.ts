import { error } from '@sveltejs/kit';
import { buildIcs } from '$lib/notify/ics';
import type { Setting } from '$lib/model/countermeasures';
import type { Forecast } from '$lib/model/types';
import { assess, futurePoints, protectWindows } from '$lib/model/risk';
import type { SpeciesId } from '$lib/model/species';
import type { RequestHandler } from './$types';

/**
 * Stateless calendar feed. Everything needed is in the query string, so there is
 * no subscriber record to store and nothing to expire — subscribing in the OS
 * calendar is what makes alerts survive the app being closed.
 */
export const GET: RequestHandler = async ({ url, fetch, setHeaders }) => {
	const latitude = Number(url.searchParams.get('lat'));
	const longitude = Number(url.searchParams.get('lon'));

	if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) error(400, 'bad lat');
	if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) error(400, 'bad lon');

	const species = (url.searchParams.get('species') ?? 'auto') as SpeciesId;
	const setting = (url.searchParams.get('setting') ?? 'outdoor') as Setting;
	const placeName = (url.searchParams.get('name') ?? 'your location').slice(0, 80);
	const minBand = Number(url.searchParams.get('minBand') ?? 2);

	// Reuse the cached forecast endpoint rather than hitting Open-Meteo again.
	const response = await fetch(`/api/forecast?lat=${latitude}&lon=${longitude}`);
	if (!response.ok) error(502, 'Could not load the forecast');

	const forecast = (await response.json()) as Forecast;
	const assessment = assess(forecast, species);
	const upcoming = futurePoints(assessment.points);
	const windows = protectWindows(upcoming);

	const body = buildIcs({
		windows,
		points: upcoming,
		setting,
		placeName,
		origin: url.origin,
		minBand: Number.isFinite(minBand) ? minBand : 2
	});

	setHeaders({
		'content-type': 'text/calendar; charset=utf-8',
		'content-disposition': `inline; filename="mosquito-${placeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics"`,
		'cache-control': 'public, max-age=3600'
	});

	return new Response(body);
};
