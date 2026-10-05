import { render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultInsights } from "@/lib/result-insights";
import ResultsScreen from "./ResultsScreen";

const previousBest = vi.fn<() => Promise<number | null>>();
let insights: ResultInsights | null = null;

vi.mock("@/lib/queries", () => ({
	useRecentResults: () => () => [],
	findPreviousBest: () => previousBest(),
}));
vi.mock("@/lib/result-insights", () => ({
	latestResultInsights: () => insights,
}));
vi.mock("@/lib/utils/reduced-motion", () => ({
	prefersReducedMotion: () => true,
}));

function makeInsights(overrides?: Partial<ResultInsights>): ResultInsights {
	return {
		mode: { type: "time", seconds: 30 },
		timestamp: 1_000,
		duration: 30,
		afk: false,
		rawPerSecond: [],
		errorsPerSecond: [],
		...overrides,
	};
}

function renderResults(saveFailed?: boolean) {
	return render(() => (
		<ResultsScreen
			wpm={80}
			rawWpm={82}
			accuracy={98}
			consistency={90}
			breakdown={{ correct: 10, incorrect: 0, missed: 0, extra: 0, total: 10 }}
			elapsed={30_000}
			wpmPerSecond={[]}
			onRedo={() => {}}
			saveFailed={saveFailed}
		/>
	));
}

describe("ResultsScreen", () => {
	beforeEach(() => {
		insights = null;
		previousBest.mockReset();
	});

	it("notes when the result could not be saved, and still shows it", () => {
		renderResults(true);
		expect(screen.getByText(/couldn't save this result/i)).toBeInTheDocument();
		expect(screen.getByText("80")).toBeInTheDocument();
	});

	it("shows no save note when the result was saved", () => {
		renderResults(false);
		expect(screen.queryByText(/couldn't save this result/i)).toBeNull();
	});

	it("shows the margin over the previous best when it is beaten", async () => {
		insights = makeInsights();
		previousBest.mockResolvedValue(68);
		renderResults();
		expect(await screen.findByText("+12 PB")).toBeInTheDocument();
	});

	it("shows the standing best when the result falls short", async () => {
		insights = makeInsights();
		previousBest.mockResolvedValue(95);
		renderResults();
		expect(await screen.findByText("PB 95")).toBeInTheDocument();
	});

	it("marks an AFK result and never compares it with the best", () => {
		insights = makeInsights({ afk: true });
		renderResults();
		expect(screen.getByText("AFK detected")).toBeInTheDocument();
		expect(screen.getByText(/doesn't count toward your best/i)).toBeVisible();
		expect(previousBest).not.toHaveBeenCalled();
	});

	it("names the mode beside the hero", () => {
		insights = makeInsights();
		previousBest.mockResolvedValue(null);
		renderResults();
		expect(screen.getByTestId("result-mode")).toHaveTextContent("time 30s");
	});
});
