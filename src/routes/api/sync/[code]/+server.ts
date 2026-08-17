import { error, json } from '@sveltejs/kit';
import { getStore } from '@netlify/blobs';
import type { RequestHandler } from './$types';

/**
 * Optional device-to-device handoff for saved places. The user generates a short
 * code on one device and enters it on another; the blob expires on its own.
 *
 * There are no accounts and no personal data beyond the place list the user typed,
 * so the code is the only credential. It is deliberately short-lived.
 */

const MAX_BYTES = 16 * 1024;
const TTL_MS = 60 * 60 * 1000;

interface Payload {
	savedAt: number;
	places: unknown;
}

function store() {
	try {
		return getStore({ name: 'place-sync', consistency: 'strong' });
	} catch {
		return null;
	}
}

function validCode(code: string): boolean {
	return /^[A-Z0-9]{6}$/.test(code);
}

export const PUT: RequestHandler = async ({ params, request }) => {
	const code = params.code.toUpperCase();
	if (!validCode(code)) error(400, 'Code must be six characters, A-Z and 0-9');

	const body = await request.text();
	if (body.length > MAX_BYTES) error(413, 'Too much data to sync');

	let places: unknown;
	try {
		places = JSON.parse(body);
	} catch {
		error(400, 'Body must be JSON');
	}

	const blobs = store();
	if (!blobs) error(503, 'Sync is unavailable in this environment');

	await blobs.setJSON(code, { savedAt: Date.now(), places } satisfies Payload);
	return json({ ok: true, expiresInMinutes: TTL_MS / 60000 });
};

export const GET: RequestHandler = async ({ params }) => {
	const code = params.code.toUpperCase();
	if (!validCode(code)) error(400, 'Code must be six characters, A-Z and 0-9');

	const blobs = store();
	if (!blobs) error(503, 'Sync is unavailable in this environment');

	const payload = (await blobs.get(code, { type: 'json' })) as Payload | null;
	if (!payload) error(404, 'No such code, or it has expired');

	if (Date.now() - payload.savedAt > TTL_MS) {
		await blobs.delete(code).catch(() => {});
		error(410, 'That code has expired');
	}

	return json({ places: payload.places });
};
