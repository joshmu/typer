import { render } from "@solidjs/testing-library";
import { beforeAll, describe, expect, it } from "vitest";
import WPMChart from "./WPMChart";

beforeAll(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

describe("WPMChart", () => {
	it("charts a 200k-second session without overflowing or drawing every second", () => {
		const wpm = Array.from({ length: 200_000 }, (_, i) => 40 + (i % 9));
		wpm[150_000] = 180;
		const raw = wpm.map((v) => v + 5);
		const errors = wpm.map((_, i) => (i % 5 ? 0 : 1));
		const { container } = render(() => (
			<WPMChart wpm={wpm} raw={raw} errors={errors} drawDelay={null} />
		));
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("aria-label")).toBe(
			"WPM over 200000 seconds, peaking at 180",
		);
		for (const path of container.querySelectorAll("path")) {
			const curves = (path.getAttribute("d") ?? "").split("C").length - 1;
			expect(curves).toBeLessThanOrEqual(602);
		}
		expect(container.querySelectorAll("rect").length).toBeLessThanOrEqual(300);
	});

	it("reads a bucketed day-long session in true seconds", () => {
		const wpm = Array.from({ length: 600 }, (_, i) => (i === 0 ? 25 : 0));
		const { container, getByTestId } = render(() => (
			<WPMChart wpm={wpm} sampleSeconds={144} drawDelay={null} />
		));
		expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(
			"WPM over 86400 seconds, peaking at 25",
		);
		const chart = container.firstElementChild as HTMLElement;
		chart.dispatchEvent(
			new PointerEvent("pointermove", { clientX: 36, bubbles: true }),
		);
		expect(getByTestId("chart-readout").textContent).toContain("1s–2:24");
		expect(getByTestId("chart-readout").textContent).toContain("25 wpm");
	});
});
