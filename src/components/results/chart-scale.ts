const TIME_STEPS = [5, 10, 15, 20, 30, 60, 120, 300, 600];
const MAX_TIME_BANDS = 6;
const WPM_STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200];
const WPM_BANDS = 4;

/** X-axis ticks in seconds: the first, every tidy step, and the last. */
export function timeTicks(seconds: number): number[] {
	if (seconds <= 1) return [1];
	const step =
		TIME_STEPS.find((s) => Math.ceil(seconds / s) <= MAX_TIME_BANDS) ??
		TIME_STEPS[TIME_STEPS.length - 1];
	const ticks = [1];
	for (let t = step; t < seconds; t += step) ticks.push(t);
	const last = ticks[ticks.length - 1];
	if (ticks.length > 1 && seconds - last < step / 2) ticks.pop();
	ticks.push(seconds);
	return ticks;
}

export function formatSecond(second: number): string {
	if (second < 60) return `${second}s`;
	const secs = second % 60;
	return `${Math.floor(second / 60)}:${secs.toString().padStart(2, "0")}`;
}

/** A y-axis top rounded up to a tidy step, with four equal bands. */
export function wpmScale(peak: number): { max: number; ticks: number[] } {
	const raw = Math.max(peak, 1) / WPM_BANDS;
	const step = WPM_STEPS.find((s) => s >= raw) ?? Math.ceil(raw / 100) * 100;
	return {
		max: step * WPM_BANDS,
		ticks: Array.from({ length: WPM_BANDS + 1 }, (_, i) => i * step),
	};
}

type Point = readonly [number, number];

const fmt = (n: number) => Math.round(n * 100) / 100;

/**
 * A smooth SVG path through the points that never overshoots them
 * (monotone cubic interpolation), so a flat run stays flat.
 */
export function monotonePath(points: readonly Point[]): string {
	const n = points.length;
	if (n === 0) return "";
	if (n === 1) return `M${fmt(points[0][0])},${fmt(points[0][1])}`;

	const slopes: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		const [x0, y0] = points[i];
		const [x1, y1] = points[i + 1];
		slopes.push((y1 - y0) / (x1 - x0 || 1));
	}
	const tangents = points.map((_, i) => {
		if (i === 0) return slopes[0];
		if (i === n - 1) return slopes[n - 2];
		const a = slopes[i - 1];
		const b = slopes[i];
		return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
	});

	let d = `M${fmt(points[0][0])},${fmt(points[0][1])}`;
	for (let i = 0; i < n - 1; i++) {
		const [x0, y0] = points[i];
		const [x1, y1] = points[i + 1];
		const h = (x1 - x0) / 3;
		d += ` C${fmt(x0 + h)},${fmt(y0 + tangents[i] * h)} ${fmt(x1 - h)},${fmt(y1 - tangents[i + 1] * h)} ${fmt(x1)},${fmt(y1)}`;
	}
	return d;
}
