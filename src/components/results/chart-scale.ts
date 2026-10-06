const TIME_STEPS = [5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600];
const MAX_TIME_BANDS = 6;
const WPM_STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200];
const WPM_BANDS = 4;

/** X-axis ticks in seconds: the first, every tidy step, and the last. */
export function timeTicks(seconds: number): number[] {
	if (seconds <= 1) return [1];
	// past the tidy steps (sessions over an hour), whole hours
	const step =
		TIME_STEPS.find((s) => Math.ceil(seconds / s) <= MAX_TIME_BANDS) ??
		Math.ceil(seconds / MAX_TIME_BANDS / 3600) * 3600;
	const ticks = [1];
	for (let t = step; t < seconds; t += step) ticks.push(t);
	const last = ticks[ticks.length - 1];
	if (ticks.length > 1 && seconds - last < step / 2) ticks.pop();
	ticks.push(seconds);
	return ticks;
}

export function formatSecond(second: number): string {
	if (second < 60) return `${second}s`;
	const pad = (n: number) => n.toString().padStart(2, "0");
	const secs = second % 60;
	if (second < 3600) return `${Math.floor(second / 60)}:${pad(secs)}`;
	const mins = Math.floor(second / 60) % 60;
	return `${Math.floor(second / 3600)}:${pad(mins)}:${pad(secs)}`;
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

/** A centred moving average; the ends average what neighbours they have. */
export function movingAverage(values: number[], window: number): number[] {
	const half = Math.floor(window / 2);
	return values.map((_, i) => {
		const from = Math.max(0, i - half);
		const to = Math.min(values.length, i + half + 1);
		let sum = 0;
		for (let j = from; j < to; j++) sum += values[j];
		return Math.round(sum / (to - from));
	});
}

/** Seconds averaged into each point of the smoothed WPM line. */
export function smoothingWindow(seconds: number): number {
	return seconds > 30 ? 5 : 3;
}

/** The largest sample across the series (0 with none). A loop, not a spread:
 * an unbounded zen or book session can outgrow Math.max's argument limit. */
export function peakOf(
	...series: readonly (readonly number[] | undefined)[]
): number {
	let peak = 0;
	for (const values of series) {
		if (!values) continue;
		for (const v of values) if (v > peak) peak = v;
	}
	return peak;
}

/**
 * Which seconds to draw: all of them up to `maxPoints`, otherwise the lowest
 * and highest second of each of `maxPoints / 2` equal buckets, so peaks and
 * dips survive. Always keeps the first and last second, in order.
 */
export function chartIndices(
	values: readonly number[],
	maxPoints: number,
): number[] {
	const n = values.length;
	if (n <= maxPoints) return Array.from({ length: n }, (_, i) => i);
	const buckets = Math.max(1, Math.floor(maxPoints / 2));
	const kept: number[] = [0];
	for (let b = 0; b < buckets; b++) {
		const from = Math.floor((b * n) / buckets);
		const to = Math.floor(((b + 1) * n) / buckets);
		let lo = from;
		let hi = from;
		for (let i = from + 1; i < to; i++) {
			if (values[i] < values[lo]) lo = i;
			if (values[i] > values[hi]) hi = i;
		}
		for (const i of lo < hi ? [lo, hi] : [hi, lo]) {
			if (i > kept[kept.length - 1]) kept.push(i);
		}
	}
	if (kept[kept.length - 1] !== n - 1) kept.push(n - 1);
	return kept;
}

/**
 * Error marks for the first `count` seconds: one per second with errors, or
 * on a long session one per bucket (at its worst second) carrying the
 * bucket's total.
 */
export function errorMarks(
	errors: readonly number[],
	count: number,
	maxMarks: number,
): { i: number; n: number }[] {
	const n = Math.min(count, errors.length);
	const marks: { i: number; n: number }[] = [];
	if (n <= maxMarks) {
		for (let i = 0; i < n; i++)
			if (errors[i] > 0) marks.push({ i, n: errors[i] });
		return marks;
	}
	for (let b = 0; b < maxMarks; b++) {
		const from = Math.floor((b * n) / maxMarks);
		const to = Math.floor(((b + 1) * n) / maxMarks);
		let total = 0;
		let worst = from;
		for (let i = from; i < to; i++) {
			total += errors[i];
			if (errors[i] > errors[worst]) worst = i;
		}
		if (total > 0) marks.push({ i: worst, n: total });
	}
	return marks;
}
