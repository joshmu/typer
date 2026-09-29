import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeySound, keySoundFor, silentKeySound } from "./key-sound";

class FakeBuffer {
	readonly data: Float32Array;
	constructor(length: number) {
		this.data = new Float32Array(length);
	}
	getChannelData() {
		return this.data;
	}
}

class FakeSource {
	buffer: FakeBuffer | null = null;
	connectedTo: unknown = null;
	started = 0;
	connect(node: unknown) {
		this.connectedTo = node;
	}
	start() {
		this.started++;
	}
}

class FakeContext {
	static instances: FakeContext[] = [];
	state: "running" | "suspended" = "running";
	readonly sampleRate = 48000;
	readonly destination = {};
	readonly buffers: FakeBuffer[] = [];
	readonly sources: FakeSource[] = [];
	readonly gains: { gain: { value: number }; connect: () => void }[] = [];
	resume = vi.fn(() => Promise.resolve());
	constructor() {
		FakeContext.instances.push(this);
	}
	createBuffer(_channels: number, length: number) {
		const buffer = new FakeBuffer(length);
		this.buffers.push(buffer);
		return buffer;
	}
	createBufferSource() {
		const source = new FakeSource();
		this.sources.push(source);
		return source;
	}
	createGain() {
		const gain = { gain: { value: 1 }, connect: vi.fn() };
		this.gains.push(gain);
		return gain;
	}
}

const fakeContext = () => new FakeContext() as unknown as AudioContext;

afterEach(() => {
	FakeContext.instances = [];
	vi.unstubAllGlobals();
});

describe("createKeySound", () => {
	it("creates no audio context until the first play", () => {
		const create = vi.fn(fakeContext);
		createKeySound(create);
		expect(create).not.toHaveBeenCalled();
	});

	it("creates one context and synthesizes the click buffers once", () => {
		const create = vi.fn(fakeContext);
		const sound = createKeySound(create);
		for (let i = 0; i < 10; i++) sound.play(i % 2 === 0);

		expect(create).toHaveBeenCalledTimes(1);
		const [ctx] = FakeContext.instances;
		expect(ctx.buffers).toHaveLength(2);
		expect(ctx.gains).toHaveLength(1);
		for (const buffer of ctx.buffers) {
			expect(buffer.data.some((v) => v !== 0)).toBe(true);
		}
	});

	it("starts one buffer source through the shared gain per play", () => {
		const sound = createKeySound(fakeContext);
		sound.play(true);
		sound.play(false);
		sound.play(true);

		const [ctx] = FakeContext.instances;
		expect(ctx.sources).toHaveLength(3);
		for (const source of ctx.sources) {
			expect(source.started).toBe(1);
			expect(source.connectedTo).toBe(ctx.gains[0]);
		}
	});

	it("plays a different click for a wrong key", () => {
		const sound = createKeySound(fakeContext);
		sound.play(true);
		sound.play(false);
		sound.play(true);

		const [ok, wrong, okAgain] = FakeContext.instances[0].sources;
		expect(ok.buffer).not.toBe(wrong.buffer);
		expect(ok.buffer).toBe(okAgain.buffer);
	});

	it("resumes a suspended context", () => {
		const sound = createKeySound(fakeContext);
		sound.play(true);
		const [ctx] = FakeContext.instances;
		expect(ctx.resume).not.toHaveBeenCalled();

		ctx.state = "suspended";
		sound.play(true);
		expect(ctx.resume).toHaveBeenCalledTimes(1);
	});

	it("swallows a context that cannot be created", () => {
		const create = vi.fn(() => {
			throw new Error("no audio");
		});
		const sound = createKeySound(create);
		expect(() => sound.play(true)).not.toThrow();
		expect(() => sound.play(true)).not.toThrow();
		expect(create).toHaveBeenCalledTimes(1);
	});

	it("swallows playback errors and a rejected resume", async () => {
		const sound = createKeySound(fakeContext);
		sound.play(true);
		const [ctx] = FakeContext.instances;
		ctx.state = "suspended";
		ctx.resume.mockImplementation(() => Promise.reject(new Error("blocked")));
		ctx.createBufferSource = () => {
			throw new Error("closed");
		};

		expect(() => sound.play(true)).not.toThrow();
		await Promise.resolve();
	});
});

describe("keySoundFor", () => {
	it("is a silent no-op when key sound is off", () => {
		vi.stubGlobal("AudioContext", FakeContext);
		const sound = keySoundFor(false);
		expect(sound).toBe(silentKeySound);
		sound.play(true);
		expect(FakeContext.instances).toHaveLength(0);
	});

	it("shares one audible key sound when key sound is on", () => {
		vi.stubGlobal("AudioContext", FakeContext);
		const sound = keySoundFor(true);
		expect(keySoundFor(true)).toBe(sound);
		expect(FakeContext.instances).toHaveLength(0);

		sound.play(true);
		keySoundFor(true).play(false);
		expect(FakeContext.instances).toHaveLength(1);
		expect(FakeContext.instances[0].sources).toHaveLength(2);
	});
});
