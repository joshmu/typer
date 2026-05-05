import { lazy, Match, Show, Switch } from "solid-js";
import BookBrowser from "@/components/books/BookBrowser";
import BookHeader from "@/components/books/BookHeader";
import ModeSelector from "@/components/typing/ModeSelector";
import TextInputModal from "@/components/typing/TextInputModal";
import TypingTest from "@/components/typing/TypingTest";
import { loadExpandedQuotes } from "@/lib/core/text/quotes";
import { usePreferences } from "@/lib/preferences-context";
import { useTestSession } from "@/lib/use-test-session";

const ResultsScreen = lazy(() => import("@/components/results/ResultsScreen"));

export default function Home() {
	const [prefs, setPrefs] = usePreferences();

	// Eagerly load expanded quotes (fire-and-forget)
	loadExpandedQuotes();

	const session = useTestSession({
		wordListSize: () => prefs.wordListSize,
	});

	return (
		<main class="flex flex-col items-center justify-center flex-1 px-8 py-12">
			<Show when={!session.result() && !session.text()}>
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
						<div>
							<Show
								when={session.mode().type === "book" && session.activeBook()}
							>
								<div class="text-center mb-6">
									<p class="text-sm text-text-sub mb-2">
										{session.activeBook()!.meta.title} · Chapter{" "}
										{session.bookFeeder()?.currentChapter !== undefined
											? session.bookFeeder()!.currentChapter + 1
											: "?"}
									</p>
									<div class="w-64 mx-auto h-1.5 bg-bg-secondary rounded-full overflow-hidden">
										<div
											class="h-full bg-primary transition-all"
											style={{ width: `${session.bookProgressPercent()}%` }}
										/>
									</div>
									<p class="text-xs text-text-sub mt-1">
										{session.bookProgressPercent()}% complete
									</p>
								</div>
							</Show>
							<ResultsScreen
								wpm={r().wpm}
								rawWpm={r().rawWpm}
								accuracy={r().accuracy}
								consistency={r().consistency}
								breakdown={r().breakdown}
								elapsed={r().elapsed}
								wpmPerSecond={r().wpmPerSecond}
								onRedo={() => session.redo()}
								redoLabel={
									session.mode().type === "book"
										? session.bookFeeder()?.isComplete
											? "Back to Library"
											: "Continue Reading"
										: undefined
								}
							/>
						</div>
					)}
				</Match>
				<Match when={session.text()}>
					{(t) => (
						<div class="w-full">
							<Show
								when={session.mode().type === "book" && session.activeBook()}
							>
								<BookHeader
									book={session.activeBook()!.meta}
									chapterIndex={session.bookFeeder()?.currentChapter ?? 0}
									chapterTitle={
										session.activeBook()!.chapters[
											session.bookFeeder()?.currentChapter ?? 0
										]?.title
									}
									progressPercent={session.bookProgressPercent()}
								/>
							</Show>
							<TypingTest
								text={t()}
								mode={session.mode()}
								stopOnError={prefs.stopOnError}
								onComplete={(state) => session.complete(state)}
								bookFeeder={session.bookFeeder() ?? undefined}
							/>
						</div>
					)}
				</Match>
				<Match when={session.mode().type === "custom" && !session.text()}>
					<TextInputModal onSubmit={(t) => session.setCustomText(t)} />
				</Match>
				<Match
					when={
						session.mode().type === "book" &&
						!session.text() &&
						!session.activeBook()
					}
				>
					<BookBrowser
						allProgress={session.allBookProgress() ?? []}
						onSelectBook={(bookId, progress) =>
							session.selectBook(bookId, progress)
						}
						loading={session.bookLoading()}
					/>
				</Match>
			</Switch>
		</main>
	);
}
