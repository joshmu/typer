import { afterEach, describe, expect, it, vi } from "vitest";

const confetti = Object.assign(
	vi.fn(() => Promise.resolve()),
	{ reset: vi.fn() },
);
vi.mock("canvas-confetti", () => ({ default: confetti }));
vi.mock("@/lib/utils/reduced-motion", () => ({
	prefersReducedMotion: () => false,
}));

/** A fresh module, so confetti has not loaded yet. */
async function freshBurst() {
	vi.resetModules();
	return (await import("./pb-burst")).burstFrom;
}

describe("burstFrom", () => {
	afterEach(() => {
		confetti.mockClear();
		document.body.innerHTML = "";
	});

	it("bursts from a chip on the page", async () => {
		const burstFrom = await freshBurst();
		const chip = document.createElement("span");
		document.body.append(chip);
		await burstFrom(chip);
		expect(confetti).toHaveBeenCalledOnce();
	});

	it("skips a chip that left the page while confetti loaded", async () => {
		const burstFrom = await freshBurst();
		const chip = document.createElement("span");
		document.body.append(chip);
		const pending = burstFrom(chip);
		chip.remove();
		await pending;
		expect(confetti).not.toHaveBeenCalled();
	});
});
