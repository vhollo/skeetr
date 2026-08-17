/** Small shared numeric helpers used by the response curves. */

export function clamp(value: number, min = 0, max = 1): number {
	return value < min ? min : value > max ? max : value;
}

/** Linear ramp from 0 at `from` to 1 at `to`. Handles descending ranges. */
export function ramp(value: number, from: number, to: number): number {
	if (from === to) return value >= to ? 1 : 0;
	return clamp((value - from) / (to - from));
}

/**
 * Smooth trapezoid: 0 below `floor`, rising to 1 across [floor, plateauLow],
 * flat to `plateauHigh`, falling back to 0 at `ceiling`.
 * Edges use smoothstep so the risk curve has no visible kinks.
 */
export function trapezoid(
	value: number,
	floor: number,
	plateauLow: number,
	plateauHigh: number,
	ceiling: number
): number {
	if (value <= floor || value >= ceiling) return 0;
	if (value >= plateauLow && value <= plateauHigh) return 1;
	if (value < plateauLow) return smoothstep(ramp(value, floor, plateauLow));
	return smoothstep(ramp(value, ceiling, plateauHigh));
}

export function smoothstep(t: number): number {
	const x = clamp(t);
	return x * x * (3 - 2 * x);
}

/** Gaussian-ish bump, 1 at centre, falling to ~0 at `halfWidth` either side. */
export function bump(distance: number, halfWidth: number): number {
	if (halfWidth <= 0) return 0;
	const t = clamp(Math.abs(distance) / halfWidth);
	return Math.exp(-3 * t * t) - Math.exp(-3);
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
