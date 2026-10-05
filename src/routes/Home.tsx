import {
	createEffect,
	createMemo,
	type JSX,
	lazy,
	Match,
	type ParentProps,
	Show,
	Switch,
} from "solid-js";
import BookBrowser from "@/components/books/BookBrowser";
import BookHeader from "@/components/books/BookHeader";
import ModeSelector from "@/components/typing/ModeSelector";
import TextInputModal from "@/components/typing/TextInputModal";
import TypingTest from "@/components/typing/TypingTest";
import { chapterLabel } from "@/lib/book-format";
import { loadExpandedQuotes } from "@/lib/core/text/quotes";
import { usePreferences } from "@/lib/preferences-context";
import { useTestSession } from "@/lib/use-test-session";

const ResultsScreen = lazy(() => import("@/components/results/ResultsScreen"));

/**
 * Anchors its content a little above centre: the spacers split the free
 * height 1 : 2.4, which puts the active line near 40% of the viewport. The
 * top spacer never shrinks below the mode bar, which floats over it.
 */
function Stage(props: ParentProps<{ above?: JSX.Element }>) {
	return (
		<div class="flex w-full flex-1 flex-col">
			<div class="min-h-[clamp(6.5rem,20vh,8.5rem)] flex-[1_1_0]" />
			<div class="relative w-full">
				<Show when={props.above}>
					{(above) => (
						<div class="absolute inset-x-0 bottom-full">{above()}</div>
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

	// Eagerly load expanded quotes (fire-and-forget)
	loadExpandedQuotes();

	const session = useTestSession({
		wordListSize: () => prefs.wordListSize,
	});

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
			<Show when={!session.result()}>
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
												{session.bookProgressPercent()}% complete
											</p>
										</div>
									) : undefined
								}
								onRedo={() => session.redo()}
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
									/>
								) : undefined
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
				<Match
					when={
						session.mode().type === "book" &&
						!session.text() &&
						!session.activeBook()
					}
				>
					{/* The library scrolls below the mode bar's reserved band */}
					<div class="w-full pt-32 pb-12">
						<BookBrowser
							allProgress={session.allBookProgress() ?? []}
							onSelectBook={(bookId, progress) =>
								session.selectBook(bookId, progress)
							}
							loading={session.bookLoading()}
						/>
					</div>
				</Match>
			</Switch>
		</main>
	);
}
