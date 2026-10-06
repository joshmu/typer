/**
 * Camera, light and post-process feel for Horde, driven by wall-clock ms so
 * every response lasts the same at 60Hz and 120Hz. Pure: no Babylon, no DOM.
 * The renderer reports what happened (keystroke, kill, breach) and reads one
 * output per frame. Under reduced motion it never shakes, punches, zooms or
 * smears colour, and the light stays still.
 */
import { comboMultiplier } from "../sim/combo";

export type JuiceOutput = {
	/** Screen-space camera offset, world units. */
	shakeX: number;
	shakeY: number;
	/** Ortho frame scale: 1 at rest, below 1 zooms in. */
	zoom: number;
	/** Chromatic aberration amount (DefaultRenderingPipeline units). */
	aberration: number;
	/** Bloom weight and the brightness it starts at. */
	bloom: number;
	bloomThreshold: number;
	/** Light pool radius around the core, world units. */
	light: number;
	/** Light pool brightness, 0..1. */
	lightGain: number;
	/** Frenzy overdrive at x3 combo, eased 0..1. */
	overdrive: number;
	/** The combo multiplier climbed since the previous update. */
	tierUp: boolean;
};

export type Juice = {
	/** A typed keystroke landed. */
	keystroke(now: number): void;
	/** An enemy died; `combo` is the streak after it. */
	kill(now: number, combo: number, boss: boolean): void;
	/** An enemy broke through to the core. */
	breach(now: number): void;
	/** The core fell: a last shake while the light goes out. */
	collapse(now: number): void;
	/** The output for this frame. The returned object is reused. */
	update(now: number, combo: number): JuiceOutput;
};

const KILL_SHAKE_MS = 100;
const KILL_SHAKE = 0.15;
// extra shake per multiplier step above x1
const KILL_SHAKE_PER_TIER = 0.06;
const BOSS_SHAKE = 0.9;
const BOSS_SHAKE_MS = 320;
const PUNCH_MS = 120;
const PUNCH = 0.015;
const PUNCH_PER_TIER = 0.003;
const BOSS_PUNCH = 0.05;
const BREACH_SHAKE = 0.6;
const BREACH_SHAKE_MS = 330;
const ABERRATION_SPIKE = 30;
const ABERRATION_MS = 250;

const BLOOM_BASE = 0.32;
const BLOOM_OVERDRIVE = 0.55;
const BLOOM_THRESHOLD = 0.72;
// overdrive lets warmer, dimmer pixels bloom too
const BLOOM_THRESHOLD_OVERDRIVE = 0.58;
const OVERDRIVE_ZOOM = 0.06;
const OVERDRIVE_ABERRATION = 4;
const OVERDRIVE_TIER = 3;
const OVERDRIVE_IN_MS = 160;
const OVERDRIVE_OUT_MS = 400;

const LIGHT_BASE = 12;
// the radius can grow this much (x base) as the combo climbs
const LIGHT_GROWTH = 0.75;
// combo at which ~63% of the growth is reached
const LIGHT_COMBO_SCALE = 10;
const LIGHT_EASE_MS = 260;
const BREATH = 0.1;
const BREATH_MS = 200;
const LIGHT_GAIN = 0.6;
const BREATH_GAIN = 0.3;
// overdrive: the light pulses on its own, fast, like a held breath
const OVERDRIVE_PULSE_MS = 420;
const OVERDRIVE_PULSE = 0.1;
// a faint flicker so the light never sits dead still
const FLICKER = 0.05;
const COLLAPSE_MS = 520;
const COLLAPSE_SHAKE = 1.1;
const COLLAPSE_SHAKE_MS = 450;

/** Deterministic jitter in [-1, 1] for an integer step. */
function jitter(k: number): number {
	const s = Math.sin(k * 12.9898) * 43758.5453;
	return (s - Math.floor(s)) * 2 - 1;
}

/** 1 at the start of a window of `ms`, easing to 0 at its end. */
function decay(now: number, at: number, ms: number): number {
	if (at < 0 || now < at) return 0;
	const t = (now - at) / ms;
	return t >= 1 ? 0 : (1 - t) * (1 - t);
}

/** Frame-rate independent approach of `v` to `target` with time constant `tau`. */
function approach(v: number, target: number, dt: number, tau: number): number {
	return target + (v - target) * Math.exp(-dt / tau);
}

export function createJuice({
	reducedMotion,
}: {
	reducedMotion: boolean;
}): Juice {
	const out: JuiceOutput = {
		shakeX: 0,
		shakeY: 0,
		zoom: 1,
		aberration: 0,
		bloom: BLOOM_BASE,
		bloomThreshold: BLOOM_THRESHOLD,
		light: LIGHT_BASE,
		lightGain: LIGHT_GAIN,
		overdrive: 0,
		tierUp: false,
	};
	let last = Number.NaN;
	let prevTier = 1;
	let overdrive = 0;
	let light = LIGHT_BASE;
	// last event times (-1 = never) and their strength
	let breathAt = -1;
	let killAt = -1;
	let killShake = 0;
	let killShakeMs = KILL_SHAKE_MS;
	let punch = 0;
	let breachAt = -1;
	let collapseAt = -1;

	return {
		keystroke(now) {
			breathAt = now;
		},
		kill(now, combo, boss) {
			const tier = comboMultiplier(combo) - 1;
			killAt = now;
			killShake = boss ? BOSS_SHAKE : KILL_SHAKE + KILL_SHAKE_PER_TIER * tier;
			killShakeMs = boss ? BOSS_SHAKE_MS : KILL_SHAKE_MS;
			punch = boss ? BOSS_PUNCH : PUNCH + PUNCH_PER_TIER * tier;
		},
		breach(now) {
			breachAt = now;
		},
		collapse(now) {
			collapseAt = now;
		},
		update(now, combo) {
			const dt = Number.isNaN(last) ? 0 : Math.max(0, now - last);
			last = now;

			const tier = comboMultiplier(combo);
			out.tierUp = tier > prevTier;
			prevTier = tier;

			const od = tier >= OVERDRIVE_TIER ? 1 : 0;
			overdrive = approach(
				overdrive,
				od,
				dt,
				od > overdrive ? OVERDRIVE_IN_MS : OVERDRIVE_OUT_MS,
			);
			out.overdrive = overdrive;
			out.bloom = BLOOM_BASE + BLOOM_OVERDRIVE * overdrive;
			out.bloomThreshold =
				BLOOM_THRESHOLD +
				(BLOOM_THRESHOLD_OVERDRIVE - BLOOM_THRESHOLD) * overdrive;
			// the core's light going out after a collapse, 1 -> 0
			const lit =
				collapseAt < 0 || now < collapseAt
					? 1
					: Math.max(0, 1 - (now - collapseAt) / COLLAPSE_MS);

			if (reducedMotion) {
				out.shakeX = 0;
				out.shakeY = 0;
				out.zoom = 1;
				out.aberration = 0;
				out.light = LIGHT_BASE;
				out.lightGain = LIGHT_GAIN * lit;
				return out;
			}

			// shake: the stronger of the kill and breach envelopes, jittered on a
			// 60Hz step grid so its texture doesn't depend on the refresh rate
			const k = decay(now, killAt, killShakeMs) * killShake;
			const b = decay(now, breachAt, BREACH_SHAKE_MS) * BREACH_SHAKE;
			const c = decay(now, collapseAt, COLLAPSE_SHAKE_MS) * COLLAPSE_SHAKE;
			const m = Math.max(k, b, c);
			if (m > 0) {
				const step = Math.floor(now / (1000 / 60));
				out.shakeX = jitter(step) * m;
				out.shakeY = jitter(step + 7) * m;
			} else {
				out.shakeX = 0;
				out.shakeY = 0;
			}

			const p = decay(now, killAt, PUNCH_MS) * punch;
			out.zoom = (1 - p) * (1 - OVERDRIVE_ZOOM * overdrive);
			out.aberration =
				Math.max(
					decay(now, breachAt, ABERRATION_MS),
					decay(now, collapseAt, ABERRATION_MS * 2),
				) *
					ABERRATION_SPIKE +
				OVERDRIVE_ABERRATION * overdrive;

			const target =
				LIGHT_BASE *
				(1 + LIGHT_GROWTH * (1 - Math.exp(-combo / LIGHT_COMBO_SCALE)));
			light = approach(light, target, dt, LIGHT_EASE_MS);
			const breath = decay(now, breathAt, BREATH_MS);
			const pulse =
				0.5 + 0.5 * Math.sin((now / OVERDRIVE_PULSE_MS) * Math.PI * 2);
			const flicker =
				Math.sin(now * 0.011) * 0.6 + Math.sin(now * 0.037 + 1.3) * 0.4;
			out.light =
				light *
				(1 + BREATH * breath + OVERDRIVE_PULSE * overdrive * pulse) *
				(0.35 + 0.65 * lit);
			out.lightGain =
				(LIGHT_GAIN +
					BREATH_GAIN * breath +
					0.25 * overdrive * pulse +
					FLICKER * flicker) *
				lit;
			return out;
		},
	};
}
