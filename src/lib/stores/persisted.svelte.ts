import { browser } from '$app/environment';

/**
 * A rune-backed value that mirrors itself into localStorage.
 *
 * Device state is the source of truth in this app — there is no account and no
 * server-side user record — so this is the whole persistence layer.
 */
export function persisted<T>(key: string, initial: T) {
	let value = $state<T>(load(key, initial));

	function load(storageKey: string, fallback: T): T {
		if (!browser) return fallback;
		try {
			const raw = localStorage.getItem(storageKey);
			if (raw == null) return fallback;
			const parsed = JSON.parse(raw) as T;
			// Merge onto the default so a schema addition doesn't strand old clients
			// with a missing field.
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? { ...(fallback as object), ...(parsed as object) } as T
				: parsed;
		} catch {
			return fallback;
		}
	}

	return {
		get current() {
			return value;
		},
		set current(next: T) {
			value = next;
			if (!browser) return;
			try {
				localStorage.setItem(key, JSON.stringify(next));
			} catch {
				// Private mode or a full quota; the app still works for this session.
			}
		},
		reset() {
			this.current = initial;
		}
	};
}
