<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { registerServiceWorker, requestBackgroundChecks } from '$lib/notify/register';

	let { children } = $props();

	onMount(async () => {
		const registration = await registerServiceWorker();
		await requestBackgroundChecks(registration);
	});

	const tabs = [
		{ href: '/', label: 'Now' },
		{ href: '/places', label: 'Places' },
		{ href: '/model', label: 'Model' },
		{ href: '/settings', label: 'Settings' }
	];

	function active(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<div class="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-24">
	{@render children()}
</div>

<nav
	class="fixed inset-x-0 bottom-0 z-20 border-t border-(--color-slate-line) bg-(--color-night-deep)/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
	aria-label="Sections"
>
	<ul class="mx-auto flex max-w-2xl list-none justify-around p-0">
		{#each tabs as tab (tab.href)}
			<li class="flex-1">
				<a
					href={tab.href}
					class="block px-2 py-3.5 text-center text-sm transition-colors"
					class:text-welt={active(tab.href)}
					style={active(tab.href)
						? 'color: var(--color-welt-soft); font-weight: 500'
						: 'color: var(--color-bone-faint)'}
					aria-current={active(tab.href) ? 'page' : undefined}
				>
					{tab.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
