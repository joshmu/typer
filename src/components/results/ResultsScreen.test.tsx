import { render, screen } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultInsights } from "@/lib/core/engine/result-insights";
import ResultsScreen from "./ResultsScreen";

const previousBest = vi.fn<() => Promise<number | null>>();
const burstFrom = vi.fn();
let reducedMotion = true;

vi.mock("@/lib/queries", () => ({
	useRecentResults: () => () => [],
	findPreviousBest: () => previousBest(),
}));
vi.mock("@/lib/utils/reduced-motion", () => ({
	prefersReducedMotion: () => reducedMotion,
}));
vi.mock("./pb-burst", () => ({
	burstFrom: (el: HTMLElement) => burstFrom(el),
	stopBurst: () => {},
}));

function makeInsights(overrides?: Partial<ResultInsights>): ResultInsights {
	return {
		mode: { type: "time", seconds: 30 },
		timestamp: 1_000,
		afk: false,
		rawPerSecond: [],
		errorsPerSecond: [],
		...overrides,
	};
}

function renderResults(
	options: { saveFailed?: boolean; insights?: ResultInsights } = {},
) {
	return render(() => (
		<ResultsScreen
			wpm={80}
			rawWpm={82}
			accuracy={98}
			consistency={90}
			breakdown={{ correct: 10, incorrect: 0, missed: 0, extra: 0, total: 10 }}
			elapsed={30_000}
			wpmPerSecond={[]}
			insights={options.insights}
			onRedo={() => {}}
			saveFailed={options.saveFailed}
		/>
	));
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("ResultsScreen", () => {
	beforeEach(() => {
		reducedMotion = true;
		previousBest.mockReset();
		burstFrom.mockReset();
	});

	it("notes when the result could not be saved, and still shows it", () => {
		renderResults({ saveFailed: true });
		expect(screen.getByText(/couldn't save this result/i)).toBeInTheDocument();
		expect(screen.getByText("80")).toBeInTheDocument();
	});

	it("shows no save note when the result was saved", () => {
		renderResults({ saveFailed: false });
		expect(screen.queryByText(/couldn't save this result/i)).toBeNull();
	});

	it("shows the margin over the previous best when it is beaten", async () => {
		previousBest.mockResolvedValue(68);
		renderResults({ insights: makeInsights() });
		expect(await screen.findByText("+12 PB")).toBeInTheDocument();
	});

	it("shows the standing best when the result falls short", async () => {
		previousBest.mockResolvedValue(95);
		renderResults({ insights: makeInsights() });
		expect(await screen.findByText("PB 95")).toBeInTheDocument();
	});

	it("marks an AFK result and never compares it with the best", () => {
		renderResults({ insights: makeInsights({ afk: true }) });
		expect(screen.getByText("AFK detected")).toBeInTheDocument();
		expect(screen.getByText(/doesn't count toward your best/i)).toBeVisible();
		expect(previousBest).not.toHaveBeenCalled();
	});

	it("shows no best for book, custom and zen results", async () => {
		previousBest.mockResolvedValue(10);
		for (const mode of [
			{ type: "book", bookId: "a/b", chapterIndex: 0 },
			{ type: "custom" },
			{ type: "zen" },
		] as ResultInsights["mode"][]) {
			const { unmount } = renderResults({ insights: makeInsights({ mode }) });
			await tick();
			expect(screen.getByTestId("pb-chip")).toBeEmptyDOMElement();
			unmount();
		}
		expect(previousBest).not.toHaveBeenCalled();
	});

	it("names the mode beside the hero", () => {
		previousBest.mockResolvedValue(null);
		renderResults({ insights: makeInsights() });
		expect(screen.getByTestId("result-mode")).toHaveTextContent("time 30s");
	});

	describe("leaving mid-reveal", () => {
		let errors: unknown[] = [];
		const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message);
		// Motion runs completion callbacks in a promise.
		const onRejection = (reason: unknown) => errors.push(reason);
		let consoleError: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			reducedMotion = false;
			vi.stubGlobal(
				"ResizeObserver",
				class {
					observe() {}
					disconnect() {}
				},
			);
			errors = [];
			window.addEventListener("error", onError);
			process.on("unhandledRejection", onRejection);
			// jsdom reports errors thrown in animation frames to the console.
			consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		});
		afterEach(() => {
			window.removeEventListener("error", onError);
			process.off("unhandledRejection", onRejection);
			consoleError.mockRestore();
			vi.unstubAllGlobals();
		});

		it("stops the reveal without a stale read or a burst into the next test", async () => {
			previousBest.mockResolvedValue(40);
			const [result, setResult] = createSignal<{ wpm: number } | null>({
				wpm: 80,
			});
			render(() => (
				<Show when={result()}>
					{(r) => (
						<ResultsScreen
							wpm={r().wpm}
							rawWpm={82}
							accuracy={98}
							consistency={90}
							breakdown={{
								correct: 10,
								incorrect: 0,
								missed: 0,
								extra: 0,
								total: 10,
							}}
							elapsed={30_000}
							wpmPerSecond={[60, 80, 90]}
							insights={makeInsights()}
							onRedo={() => {}}
						/>
					)}
				</Show>
			));
			await tick(150);
			setResult(null);
			await tick(1500);

			expect(errors).toEqual([]);
			expect(consoleError).not.toHaveBeenCalled();
			expect(burstFrom).not.toHaveBeenCalled();
		});
	});
});
