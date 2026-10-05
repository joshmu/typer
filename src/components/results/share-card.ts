import type { PersonalBestOutcome } from "@/lib/core/calc";
import {
	monotonePath,
	movingAverage,
	smoothingWindow,
	wpmScale,
} from "./chart-scale";

export interface ShareCardData {
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	time: string;
	mode: string;
	wpmPerSecond: number[];
	rawPerSecond: number[];
	pb: PersonalBestOutcome | null;
}

const W = 1200;
const H = 630;
const M = 72;
const DISPLAY = '"Urbanist", system-ui, sans-serif';
const MONO = '"Roboto Mono", ui-monospace, monospace';

interface Palette {
	bg: string;
	bgSecondary: string;
	text: string;
	textSub: string;
	primary: string;
	error: string;
}

function readPalette(): Palette {
	const css = getComputedStyle(document.documentElement);
	const read = (name: string, fallback: string) =>
		css.getPropertyValue(name).trim() || fallback;
	return {
		bg: read("--bg", "#323437"),
		bgSecondary: read("--bg-secondary", "#2c2e31"),
		text: read("--text", "#d1d0c5"),
		textSub: read("--text-sub", "#646669"),
		primary: read("--primary", "#e2b714"),
		error: read("--error", "#ca4754"),
	};
}

let scratch: CanvasRenderingContext2D | null = null;

/** A CSS colour as [r, g, b], whatever syntax the theme uses. */
function toRgb(colour: string): number[] {
	scratch ??= document.createElement("canvas").getContext("2d");
	if (!scratch) return [0, 0, 0];
	scratch.fillStyle = "#000";
	scratch.fillStyle = colour;
	const resolved = String(scratch.fillStyle);
	if (resolved.startsWith("#")) {
		const hex = resolved.slice(1);
		return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
	}
	return (resolved.match(/[\d.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
}

/** A theme colour at an alpha. */
function alpha(colour: string, a: number): string {
	return `rgba(${toRgb(colour).join(", ")}, ${a})`;
}

function luminance(rgb: number[]): number {
	const [r, g, b] = rgb.map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * The accent as drawn on the card's background: moved towards the theme's
 * text colour until it reaches large-text contrast (3:1).
 */
function readableAccent(p: Palette): string {
	const fg = toRgb(p.primary);
	const bg = toRgb(p.bg);
	const text = toRgb(p.text);
	for (let step = 0; step <= 10; step++) {
		const mixed = fg.map((v, i) => Math.round(v + ((text[i] - v) * step) / 10));
		if (contrast(mixed, bg) >= 3) return `rgb(${mixed.join(", ")})`;
	}
	return p.text;
}

async function loadFonts(): Promise<void> {
	if (!document.fonts) return;
	await Promise.allSettled([
		document.fonts.load(`700 200px ${DISPLAY}`),
		document.fonts.load(`500 24px ${DISPLAY}`),
		document.fonts.load(`400 20px ${MONO}`),
	]);
}

function spaced(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	spacing: number,
	align: "left" | "right" = "left",
): void {
	const widths = [...text].map((ch) => ctx.measureText(ch).width);
	const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
	let cx = align === "right" ? x - total : x;
	ctx.textAlign = "left";
	[...text].forEach((ch, i) => {
		ctx.fillText(ch, cx, y);
		cx += widths[i] + spacing;
	});
}

function pill(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	label: string,
	fg: string,
	bg: string,
): void {
	ctx.font = `700 24px ${DISPLAY}`;
	const w = ctx.measureText(label).width + 36;
	ctx.fillStyle = bg;
	ctx.beginPath();
	ctx.roundRect(x, y, w, 42, 21);
	ctx.fill();
	ctx.fillStyle = fg;
	ctx.textAlign = "left";
	ctx.fillText(label, x + 18, y + 29);
}

function pbLabel(pb: PersonalBestOutcome | null): string | null {
	switch (pb?.kind) {
		case "new":
			return `+${pb.delta} PB`;
		case "first":
			return "first PB";
		case "held":
			return `PB ${pb.best}`;
		case "afk":
			return "AFK detected";
		default:
			return null;
	}
}

function drawChart(
	ctx: CanvasRenderingContext2D,
	p: Palette,
	accent: string,
	data: ShareCardData,
	box: { x: number; y: number; w: number; h: number },
): void {
	const n = data.wpmPerSecond.length;
	if (n < 2) return;
	const { max, ticks } = wpmScale(
		Math.max(...data.wpmPerSecond, ...data.rawPerSecond, 0),
	);
	const x = (i: number) => box.x + (i / (n - 1)) * box.w;
	const y = (v: number) => box.y + box.h - (v / max) * box.h;

	ctx.lineWidth = 1;
	for (const tick of ticks) {
		ctx.strokeStyle = alpha(p.textSub, tick === 0 ? 0.4 : 0.15);
		ctx.beginPath();
		ctx.moveTo(box.x, y(tick));
		ctx.lineTo(box.x + box.w, y(tick));
		ctx.stroke();
	}

	const smoothed = movingAverage(data.wpmPerSecond, smoothingWindow(n));
	const wpmPts = smoothed.map((v, i) => [x(i), y(v)] as const);
	const line = new Path2D(monotonePath(wpmPts));

	const area = new Path2D(
		`${monotonePath(wpmPts)} L${x(n - 1)},${box.y + box.h} L${box.x},${box.y + box.h} Z`,
	);
	const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
	fill.addColorStop(0, alpha(p.primary, 0.28));
	fill.addColorStop(1, alpha(p.primary, 0));
	ctx.fillStyle = fill;
	ctx.fill(area);

	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	if (data.rawPerSecond.length === n) {
		ctx.strokeStyle = alpha(p.textSub, 0.8);
		ctx.lineWidth = 2.5;
		ctx.stroke(
			new Path2D(
				monotonePath(data.rawPerSecond.map((v, i) => [x(i), y(v)] as const)),
			),
		);
	}

	ctx.save();
	ctx.shadowColor = alpha(p.primary, 0.6);
	ctx.shadowBlur = 18;
	ctx.strokeStyle = accent;
	ctx.lineWidth = 5;
	ctx.stroke(line);
	ctx.restore();

	const [ex, ey] = wpmPts[n - 1];
	ctx.fillStyle = accent;
	ctx.strokeStyle = p.bg;
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.arc(ex, ey, 8, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
}

/** Draws the result as a 1200x630 PNG in the current theme's colours. */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
	await loadFonts();
	const p = readPalette();
	const accent = readableAccent(p);
	const canvas = document.createElement("canvas");
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas is unavailable");

	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, W, H);
	const glow = ctx.createRadialGradient(260, 300, 0, 260, 300, 560);
	glow.addColorStop(0, alpha(p.primary, 0.12));
	glow.addColorStop(1, alpha(p.primary, 0));
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, H);

	ctx.textBaseline = "alphabetic";
	ctx.font = `500 30px ${DISPLAY}`;
	ctx.fillStyle = accent;
	spaced(ctx, "TYPER", M, 104, 6);
	ctx.fillStyle = alpha(accent, 0.5);
	ctx.fillText("_", M + ctx.measureText("TYPER").width + 30, 104);

	ctx.font = `500 22px ${MONO}`;
	ctx.fillStyle = p.textSub;
	spaced(ctx, data.mode.toUpperCase(), W - M, 102, 4, "right");

	const afk = data.pb?.kind === "afk";
	ctx.font = `500 22px ${MONO}`;
	ctx.fillStyle = p.textSub;
	spaced(ctx, "WPM", M, 196, 6);
	ctx.save();
	ctx.font = `700 196px ${DISPLAY}`;
	ctx.fillStyle = afk ? p.textSub : accent;
	if (!afk) {
		ctx.shadowColor = alpha(p.primary, 0.35);
		ctx.shadowBlur = 48;
	}
	ctx.textAlign = "left";
	ctx.fillText(String(data.wpm), M - 8, 360);
	ctx.restore();

	const label = pbLabel(data.pb);
	if (label) {
		const isNew = data.pb?.kind === "new" || data.pb?.kind === "first";
		pill(
			ctx,
			M,
			392,
			label,
			isNew ? accent : p.textSub,
			isNew ? alpha(p.primary, 0.16) : alpha(p.textSub, 0.16),
		);
	}

	drawChart(ctx, p, accent, data, { x: 560, y: 160, w: W - M - 560, h: 260 });

	ctx.strokeStyle = alpha(p.textSub, 0.25);
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(M, 476);
	ctx.lineTo(W - M, 476);
	ctx.stroke();

	const stats = [
		["ACCURACY", `${data.accuracy}%`],
		["RAW", String(data.rawWpm)],
		["CONSISTENCY", `${data.consistency}%`],
		["TIME", data.time],
	];
	stats.forEach(([name, value], i) => {
		const sx = M + i * 210;
		ctx.font = `500 17px ${MONO}`;
		ctx.fillStyle = p.textSub;
		spaced(ctx, name, sx, 524, 3);
		ctx.font = `700 44px ${DISPLAY}`;
		ctx.fillStyle = p.text;
		ctx.textAlign = "left";
		ctx.fillText(value, sx, 576);
	});

	ctx.font = `400 20px ${MONO}`;
	ctx.fillStyle = p.textSub;
	ctx.textAlign = "right";
	ctx.fillText("typer.joshmu.dev", W - M, 572);

	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
			"image/png",
		),
	);
}
