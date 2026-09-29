/** Plays a click per keystroke; `ok` is false for a wrong key. */
export interface KeySound {
	play(ok: boolean): void;
}

export const silentKeySound: KeySound = { play() {} };

const VOLUME = 0.25;

interface Click {
	hz: number;
	seconds: number;
	decay: number;
}

const OK_CLICK: Click = { hz: 1800, seconds: 0.03, decay: 0.006 };
const WRONG_CLICK: Click = { hz: 220, seconds: 0.06, decay: 0.015 };

function synthesize(ctx: AudioContext, click: Click): AudioBuffer {
	const length = Math.ceil(ctx.sampleRate * click.seconds);
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) {
		const t = i / ctx.sampleRate;
		data[i] = Math.sin(2 * Math.PI * click.hz * t) * Math.exp(-t / click.decay);
	}
	return buffer;
}

interface Voice {
	ctx: AudioContext;
	out: GainNode;
	ok: AudioBuffer;
	wrong: AudioBuffer;
}

/**
 * Creates the audio context on the first play and synthesizes both clicks
 * then; each play only starts a buffer source. Audio errors never reach the
 * caller.
 */
export function createKeySound(
	createContext: () => AudioContext = () => new AudioContext(),
): KeySound {
	let voice: Voice | null = null;
	let failed = false;

	function open(): Voice {
		const ctx = createContext();
		const out = ctx.createGain();
		out.gain.value = VOLUME;
		out.connect(ctx.destination);
		return {
			ctx,
			out,
			ok: synthesize(ctx, OK_CLICK),
			wrong: synthesize(ctx, WRONG_CLICK),
		};
	}

	return {
		play(ok) {
			if (failed) return;
			try {
				voice ??= open();
				const { ctx } = voice;
				if (ctx.state === "suspended") ctx.resume().catch(() => {});
				const source = ctx.createBufferSource();
				source.buffer = ok ? voice.ok : voice.wrong;
				source.connect(voice.out);
				source.start();
			} catch {
				if (!voice) failed = true;
			}
		},
	};
}

let shared: KeySound | undefined;

/** The key sound for the preference: silent when off, one shared voice when on. */
export function keySoundFor(enabled: boolean): KeySound {
	if (!enabled) return silentKeySound;
	shared ??= createKeySound();
	return shared;
}
