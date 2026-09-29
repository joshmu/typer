import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import ResultsScreen from "./ResultsScreen";

vi.mock("@/lib/queries", () => ({
	useRecentResults: () => () => [],
	usePersonalBest: () => () => undefined,
}));
vi.mock("@/lib/utils/reduced-motion", () => ({
	prefersReducedMotion: () => true,
}));

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
	it("notes when the result could not be saved, and still shows it", () => {
		renderResults(true);
		expect(screen.getByText(/couldn't save this result/i)).toBeInTheDocument();
		expect(screen.getByText("80")).toBeInTheDocument();
	});

	it("shows no save note when the result was saved", () => {
		renderResults(false);
		expect(screen.queryByText(/couldn't save this result/i)).toBeNull();
	});
});
