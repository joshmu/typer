import { useNavigate } from "@solidjs/router";
import {
	createEffect,
	createMemo,
	type JSX,
	lazy,
	Match,
	on,
	onMount,
	type ParentProps,
	Show,
	Switch,
} from "solid-js";
import { reconcile } from "solid-js/store";
import BookHeader from "@/components/books/BookHeader";
import ContinueCard from "@/components/books/ContinueCard";
import ModeSelector from "@/components/typing/ModeSelector";
import TextInputModal from "@/components/typing/TextInputModal";
import TypingTest from "@/components/typing/TypingTest";
import { chapterLabel, formatBookPercent } from "@/lib/book-format";
import { loadResumableBook, useResumableBook } from "@/lib/book-progress";
import { loadExpandedQuotes } from "@/lib/core/text/quotes";
import type { TestMode } from "@/lib/core/types";
import { DEFAULT_MODE, landingMode } from "@/lib/last-mode";
import { usePreferences } from "@/lib/preferences-context";
import { isTypingActive } from "@/lib/typing-focus";
import { useTestSession } from "@/lib/use-test-session";

const ResultsScreen = lazy(() => import("@/components/results/ResultsScreen"));

/**
 * Anchors its content a little above centre: the spacers split the free
 * height 1 : 2.4, which puts the active line near 40% of the viewport. The
 * top spacer never shrinks below the mode bar, which floats over it. Both
 * slots float too, so they never move the anchored content; `below` comes
 * first in the DOM, so Shift+Tab from the typing area reaches it.
 */
function Stage(
	props: ParentProps<{ above?: JSX.Element; below?: JSX.Element }>,
) {
	return (
		<div class="flex w-full flex-1 flex-col">
			<div class="min-h-[clamp(6.5rem,20vh,8.5rem)] flex-[1_1_0]" />
			<div class="relative w-full">
				<Show when={props.above}>
					{(above) => (
						<div class="absolute inset-x-0 bottom-full">{above()}</div>
					)}
				</Show>
				<Show when={props.below}>
					{(below) => (
						<div class="absolute inset-x-0 top-full pt-[clamp(2rem,8vh,4.5rem)]">
							{below()}
						</div>
					)}
				</Show>
				{props.children}
			</div>
			<div class="flex-[2.4_1_0]" />
		</div>
	);
}

export default function Home() {
	const [prefs, setPrefs] = usePreferences();
	const navigate = useNavigate();

	// Eagerly load expanded quotes (fire-and-forget)
	loadExpandedQuotes();

	const landing = landingMode(prefs.lastMode);
	const session = useTestSession({
		wordListSize: () => prefs.wordListSize,
		initialMode: landing,
	});
	const resumable = useResumableBook(prefs.lastBookId || undefined);

	// A returning visit opens the last mode; book mode resumes the book at its
	// committed position, or falls back to the default test with none to resume.
	onMount(async () => {
		if (landing.type !== "book") {
			void session.startWithMode(landing);
			return;
		}
		const found = await loadResumableBook(landing.bookId).catch(() => null);
		// The user may have moved on while the book was read.
		if (session.mode() !== landing || session.text() !== null) return;
		if (found) session.openBook(found.book, found.progress);
		else void session.startWithMode({ ...DEFAULT_MODE });
	});

	createEffect(
		on(
			session.mode,
			(mode: TestMode) => {
				if (mode.type === "book" && !mode.bookId) return;
				setPrefs("lastMode", reconcile({ ...mode }));
			},
			{ defer: true },
		),
	);

	const inBook = () => session.mode().type === "book";

	function redo() {
		session.redo();
		// A finished book goes back to the library to pick the next one.
		if (inBook() && !session.activeBook()) navigate("/library");
	}

	// A fresh object per loaded test, so a mode or sub-option change remounts
	// TypingTest even when the text happens to repeat.
	const loadedTest = createMemo(() => {
		const text = session.text();
		return text === null ? null : { text, mode: session.mode() };
	});

	// Fetch the results chunk while the test runs, so the reveal starts on time.
	createEffect(() => {
		if (loadedTest()) void ResultsScreen.preload();
	});

	return (
		<main class="relative flex flex-1 flex-col items-center px-4 sm:px-8">
			<Show when={!session.result() && !inBook()}>
				<ModeSelector
					mode={session.mode()}
					onModeChange={(m) => session.startWithMode(m)}
					wordListSize={prefs.wordListSize}
					onWordListSizeChange={(size) => {
						setPrefs("wordListSize", size);
						session.startWithMode(session.mode());
					}}
				/>
			</Show>

			<Switch>
				<Match when={session.result()}>
					{(r) => (
						<div class="my-auto w-full py-12">
							<ResultsScreen
								wpm={r().wpm}
								rawWpm={r().rawWpm}
								accuracy={r().accuracy}
								consistency={r().consistency}
								breakdown={r().breakdown}
								elapsed={r().elapsed}
								wpmPerSecond={r().wpmPerSecond}
								insights={r().insights}
								header={
									session.mode().type === "book" && session.activeBook() ? (
										<div class="text-center">
											<p class="text-sm text-text-sub mb-2">
												{session.activeBook()!.meta.title} ·{" "}
												{chapterLabel(
													session.bookReader()?.position.chapterIndex ?? 0,
													session.bookReader()?.chapterTitle,
												)}
											</p>
											<div class="w-64 mx-auto h-1.5 bg-bg-secondary rounded-full overflow-hidden">
												<div
													class="h-full bg-primary transition-all"
													style={{
														width: `${session.bookProgressPercent()}%`,
													}}
												/>
											</div>
											<p class="text-xs text-text-sub mt-1">
												{formatBookPercent(
													session.bookProgressPercent(),
													session.bookReader()?.position,
												)}{" "}
												complete
											</p>
										</div>
									) : undefined
								}
								onRedo={redo}
								saveFailed={session.saveFailed()}
								redoLabel={
									session.mode().type === "book"
										? session.bookReader()?.finished
											? "Back to Library"
											: "Continue Reading"
										: undefined
								}
							/>
						</div>
					)}
				</Match>
				<Match when={loadedTest()} keyed>
					{(test) => (
						<Stage
							above={
								session.mode().type === "book" && session.activeBook() ? (
									<BookHeader
										book={session.activeBook()!.meta}
										chapterIndex={
											session.bookReader()?.position.chapterIndex ?? 0
										}
										chapterTitle={session.bookReader()?.chapterTitle}
										progressPercent={session.bookProgressPercent()}
										onClose={() =>
											void session.startWithMode({ ...DEFAULT_MODE })
										}
									/>
								) : undefined
							}
							below={
								inBook() ? undefined : (
									<ContinueCard
										resumable={resumable()}
										hidden={isTypingActive()}
										onContinue={(r) => session.openBook(r.book, r.progress)}
									/>
								)
							}
						>
							<TypingTest
								text={test.text}
								mode={test.mode}
								stopOnError={prefs.stopOnError}
								onComplete={(state) => session.complete(state)}
								feed={session.feed() ?? undefined}
							/>
						</Stage>
					)}
				</Match>
				<Match when={session.mode().type === "custom" && !session.text()}>
					<Stage>
						<TextInputModal onSubmit={(t) => session.setCustomText(t)} />
					</Stage>
				</Match>
			</Switch>
		</main>
	);
}
