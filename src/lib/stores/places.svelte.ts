import type { Place } from '$lib/model/types';
import { persisted } from './persisted.svelte';

export interface PlannedTrip {
	id: string;
	place: Place;
	/** Epoch ms of when the user expects to be there. */
	start: number;
	/** Hours of exposure. */
	durationHours: number;
	note?: string;
}

interface PlacesState {
	saved: Place[];
	trips: PlannedTrip[];
	/** id of the place currently being viewed, or 'current' for geolocation. */
	activeId: string;
}

const DEFAULTS: PlacesState = { saved: [], trips: [], activeId: 'current' };

const store = persisted<PlacesState>('skeeter:places', DEFAULTS);

export const places = {
	get saved() {
		return store.current.saved;
	},
	get trips() {
		return store.current.trips;
	},
	get activeId() {
		return store.current.activeId;
	},

	setActive(id: string) {
		store.current = { ...store.current, activeId: id };
	},

	add(place: Omit<Place, 'id'>): Place {
		const existing = store.current.saved.find(
			(p) => near(p.latitude, place.latitude) && near(p.longitude, place.longitude)
		);
		if (existing) return existing;

		const created: Place = { ...place, id: crypto.randomUUID() };
		store.current = { ...store.current, saved: [...store.current.saved, created] };
		return created;
	},

	rename(id: string, name: string) {
		store.current = {
			...store.current,
			saved: store.current.saved.map((p) => (p.id === id ? { ...p, name } : p))
		};
	},

	remove(id: string) {
		const state = store.current;
		store.current = {
			...state,
			saved: state.saved.filter((p) => p.id !== id),
			trips: state.trips.filter((t) => t.place.id !== id),
			activeId: state.activeId === id ? 'current' : state.activeId
		};
	},

	addTrip(trip: Omit<PlannedTrip, 'id'>): PlannedTrip {
		const created: PlannedTrip = { ...trip, id: crypto.randomUUID() };
		store.current = { ...store.current, trips: [...store.current.trips, created] };
		return created;
	},

	removeTrip(id: string) {
		store.current = {
			...store.current,
			trips: store.current.trips.filter((t) => t.id !== id)
		};
	},

	/** Drops trips whose window has fully passed. */
	pruneTrips(now = Date.now()) {
		const live = store.current.trips.filter(
			(t) => t.start + t.durationHours * 3_600_000 > now
		);
		if (live.length !== store.current.trips.length) {
			store.current = { ...store.current, trips: live };
		}
	},

	replaceAll(saved: Place[]) {
		store.current = { ...store.current, saved };
	}
};

/** Within ~100 m counts as the same place. */
function near(a: number, b: number): boolean {
	return Math.abs(a - b) < 0.001;
}
