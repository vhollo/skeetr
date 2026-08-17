import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// Honour a PORT handed in by the environment; Vite ignores it otherwise.
		port: process.env.PORT ? Number(process.env.PORT) : 5173
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
