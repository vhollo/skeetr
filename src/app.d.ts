declare global {
	namespace App {
		interface Error {
			message: string;
		}
	}

	/** Chromium-only, installed-PWA-only. Feature-detected at every call site. */
	interface ServiceWorkerRegistration {
		periodicSync?: {
			register(tag: string, options?: { minInterval: number }): Promise<void>;
			getTags(): Promise<string[]>;
			unregister(tag: string): Promise<void>;
		};
	}
}

export {};
