<script lang="ts">
	import type { ProtectWindow, RiskPoint, WeatherDay } from '$lib/model/types';
	import { skyColour } from './sky';

	interface Props {
		points: RiskPoint[];
		days: WeatherDay[];
		windows?: ProtectWindow[];
		timezone: string;
		now?: number;
		/** Hours to draw. */
		span?: number;
		height?: number;
		onhover?: (point: RiskPoint | null) => void;
	}

	let {
		points,
		days,
		windows = [],
		timezone,
		now = Date.now(),
		span = 48,
		height = 190,
		onhover
	}: Props = $props();

	const PAD_BOTTOM = 26;

	// Draw in real pixels rather than a fixed viewBox. A fixed viewBox letterboxes
	// against a fixed CSS height, which left a band of dead space above the curve
	// on narrow screens; matching the coordinate system to the measured width
	// keeps strokes and text undistorted at every size.
	let measured = $state(0);
	let W = $derived(measured || 960);

	let shown = $derived(points.slice(0, span));
	let step = $derived(shown.length > 1 ? W / (shown.length - 1) : W);
	let plotHeight = $derived(height - PAD_BOTTOM);

	function x(index: number): number {
		return index * step;
	}

	function y(score: number): number {
		return plotHeight - (score / 100) * (plotHeight - 8);
	}

	function xForTime(time: number): number {
		if (shown.length < 2) return 0;
		const first = shown[0].time;
		const hourMs = shown[1].time - first;
		return ((time - first) / hourMs) * step;
	}

	/** Smooth the risk curve with a monotone-ish cubic so it reads as a swell. */
	let areaPath = $derived.by(() => {
		if (shown.length === 0) return '';
		const commands = [`M 0 ${plotHeight}`, `L 0 ${y(shown[0].score)}`];
		for (let i = 1; i < shown.length; i++) {
			const x0 = x(i - 1);
			const x1 = x(i);
			const cx = (x0 + x1) / 2;
			commands.push(`C ${cx} ${y(shown[i - 1].score)}, ${cx} ${y(shown[i].score)}, ${x1} ${y(shown[i].score)}`);
		}
		commands.push(`L ${x(shown.length - 1)} ${plotHeight}`, 'Z');
		return commands.join(' ');
	});

	let linePath = $derived(areaPath.replace(/^M 0 [\d.]+ L/, 'M').replace(/ L [\d.]+ [\d.]+ Z$/, ''));

	/** Midnight ticks, so the eye can find "tomorrow" without reading labels. */
	let dayBreaks = $derived(
		shown
			.map((point, index) => ({ point, index }))
			.filter(({ point }) => hourIn(point.time) === 0)
	);

	let peak = $derived(
		shown.reduce<RiskPoint | null>((best, p) => (!best || p.score > best.score ? p : best), null)
	);

	let nowX = $derived(xForTime(now));
	let peakX = $derived(peak ? xForTime(peak.time) : 0);

	function hourIn(time: number): number {
		return Number(
			new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(
				time
			)
		);
	}

	function label(time: number): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(time);
	}

	function dayLabel(time: number): string {
		return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short' }).format(time);
	}

	let hovered = $state<number | null>(null);

	function pick(event: PointerEvent) {
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const ratio = (event.clientX - rect.left) / rect.width;
		const index = Math.round(ratio * (shown.length - 1));
		hovered = Math.max(0, Math.min(shown.length - 1, index));
		onhover?.(shown[hovered] ?? null);
	}

	function clear() {
		hovered = null;
		onhover?.(null);
	}
</script>

<figure class="m-0" bind:clientWidth={measured}>
	<svg
		viewBox="0 0 {W} {height}"
		class="block w-full touch-pan-y"
		style="height: {height}px"
		role="img"
		aria-label="Mosquito risk over the next {span} hours, shaded by time of day"
		onpointermove={pick}
		onpointerleave={clear}
	>
		<!-- Sky. One rect per hour, coloured by where the sun is. -->
		<g>
			{#each shown as point, i (point.time)}
				<rect
					x={x(i) - step / 2}
					y="0"
					width={step + 0.6}
					height={plotHeight}
					fill={skyColour(point.time, days)}
				/>
			{/each}
		</g>

		<!-- Protect windows: bracketed spans under the curve. -->
		{#each windows as window (window.start)}
			{@const left = xForTime(window.start)}
			{@const right = xForTime(window.end)}
			{#if right > 0 && left < W}
				<rect
					x={Math.max(0, left)}
					y="0"
					width={Math.min(right, W) - Math.max(0, left)}
					height={plotHeight}
					fill="var(--color-welt)"
					opacity="0.09"
				/>
				<line
					x1={Math.max(0, left)}
					x2={Math.min(right, W)}
					y1={plotHeight - 1}
					y2={plotHeight - 1}
					stroke="var(--color-welt)"
					stroke-width="2"
				/>
			{/if}
		{/each}

		<!-- Midnight dividers. -->
		{#each dayBreaks as { point, index } (point.time)}
			<line
				x1={x(index)}
				x2={x(index)}
				y1="0"
				y2={plotHeight}
				stroke="var(--color-bone)"
				stroke-width="1"
				opacity="0.16"
				stroke-dasharray="2 4"
			/>
			<text
				x={x(index) + 6}
				y="14"
				fill="var(--color-bone-dim)"
				font-size="11"
				font-family="var(--font-mono)">{dayLabel(point.time)}</text
			>
		{/each}

		<!-- The risk swell. -->
		<defs>
			<linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="var(--color-welt)" stop-opacity="0.85" />
				<stop offset="100%" stop-color="var(--color-welt)" stop-opacity="0.12" />
			</linearGradient>
		</defs>
		<path d={areaPath} fill="url(#riskFill)" />
		<path d={linePath} fill="none" stroke="var(--color-welt-soft)" stroke-width="2" />

		<!-- Now. -->
		{#if nowX >= 0 && nowX <= W}
			<line x1={nowX} x2={nowX} y1="0" y2={plotHeight} stroke="var(--color-bone)" stroke-width="1.5" />
			<circle cx={nowX} cy={plotHeight} r="3.5" fill="var(--color-bone)" />
		{/if}

		<!-- Peak marker: the single most useful number on the chart. -->
		{#if peak && peak.score > 0}
			<circle cx={peakX} cy={y(peak.score)} r="3.5" fill="var(--color-bone)" />
			<text
				x={Math.min(Math.max(peakX, 26), W - 60)}
				y={Math.max(y(peak.score) - 10, 12)}
				fill="var(--color-bone)"
				font-size="13"
				font-family="var(--font-mono)"
				text-anchor="middle">{peak.score} · {label(peak.time)}</text
			>
		{/if}

		<!-- Hover readout. -->
		{#if hovered != null && shown[hovered]}
			{@const point = shown[hovered]}
			<line
				x1={x(hovered)}
				x2={x(hovered)}
				y1="0"
				y2={plotHeight}
				stroke="var(--color-bone)"
				stroke-width="1"
				opacity="0.5"
			/>
			<circle cx={x(hovered)} cy={y(point.score)} r="4" fill="var(--color-bone)" />
			<text
				x={Math.min(Math.max(x(hovered), 30), W - 30)}
				y={height - 8}
				fill="var(--color-bone)"
				font-size="13"
				font-family="var(--font-mono)"
				text-anchor="middle">{label(point.time)} · {point.score}</text
			>
		{:else}
			<text x="0" y={height - 8} fill="var(--color-bone-faint)" font-size="12" font-family="var(--font-mono)"
				>{shown.length ? label(shown[0].time) : ''}</text
			>
			<text
				x={W}
				y={height - 8}
				fill="var(--color-bone-faint)"
				font-size="12"
				font-family="var(--font-mono)"
				text-anchor="end">{shown.length ? label(shown[shown.length - 1].time) : ''}</text
			>
		{/if}
	</svg>
</figure>
