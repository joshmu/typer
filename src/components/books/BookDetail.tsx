import { For, Show } from "solid-js";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";

interface BookDetailProps {
	book: BookMeta;
	progress?: BookProgress;
	loading?: boolean;
	onStart: () => void;
	onClose: () => void;
}

export default function BookDetail(props: BookDetailProps) {
	const progressPercent = () => {
		const p = props.progress;
		if (!p || !props.book.wordCount) return 0;
		return Math.round((p.totalCharsTyped / (props.book.wordCount * 5)) * 100);
	};

	return (
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
			<div class="bg-bg-secondary rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
				{/* Close button */}
				<div class="flex justify-end mb-4">
					<button
						type="button"
						class="text-text-sub hover:text-text transition-colors text-sm"
						onClick={props.onClose}
					>
						Close
					</button>
				</div>

				{/* Cover + metadata */}
				<div class="flex gap-5">
					<Show when={props.book.coverHeroUrl || props.book.coverUrl}>
						<img
							src={props.book.coverHeroUrl || props.book.coverUrl}
							alt={`Cover of ${props.book.title}`}
							class="w-[120px] h-[180px] object-cover rounded-md shadow-lg flex-shrink-0"
						/>
					</Show>
					<div class="flex flex-col gap-1 min-w-0">
						<h2 class="text-lg font-bold text-text">{props.book.title}</h2>
						<p class="text-sm text-text-sub">{props.book.author}</p>
						{props.book.wordCount > 0 && (
							<p class="text-xs text-text-sub">
								{props.book.wordCount.toLocaleString()} words ·{" "}
								{props.book.chapters.length} chapters
							</p>
						)}
						{props.book.language && (
							<p class="text-xs text-text-sub">{props.book.language}</p>
						)}

						{/* Progress */}
						<Show when={props.progress}>
							<div class="mt-2">
								<div class="flex justify-between text-xs text-text-sub mb-1">
									<span>
										Chapter {props.progress!.chapterIndex + 1} of{" "}
										{props.book.chapters.length}
									</span>
									<span>{progressPercent()}% complete</span>
								</div>
								<div class="h-1.5 bg-bg rounded-full overflow-hidden">
									<div
										class="h-full bg-primary transition-all"
										style={{ width: `${progressPercent()}%` }}
									/>
								</div>
								<p class="text-xs text-text-sub mt-1">
									{props.progress!.averageWpm > 0 && (
										<>Avg {Math.round(props.progress!.averageWpm)} WPM · </>
									)}
									{props.progress!.sessionCount} session
									{props.progress!.sessionCount !== 1 ? "s" : ""}
								</p>
							</div>
						</Show>
					</div>
				</div>

				{/* Description */}
				<Show when={props.book.description}>
					<p class="mt-4 text-sm text-text-sub leading-relaxed">
						{props.book.description}
					</p>
				</Show>

				{/* Chapter list */}
				<Show when={props.book.chapters.length > 0}>
					<div class="mt-4">
						<h3 class="text-xs font-medium text-text-sub uppercase tracking-wider mb-2">
							Chapters
						</h3>
						<ol class="space-y-1 text-sm max-h-[200px] overflow-y-auto">
							<For each={props.book.chapters}>
								{(chapter, i) => (
									<li
										class={`flex items-center gap-2 py-0.5 ${
											props.progress?.completedChapters.includes(i())
												? "text-primary"
												: props.progress?.chapterIndex === i()
													? "text-text"
													: "text-text-sub"
										}`}
									>
										<span class="w-4 text-center">
											{props.progress?.completedChapters.includes(i())
												? "✓"
												: i() + 1}
										</span>
										<span class="truncate">
											{chapter.replace("chapter-", "Chapter ")}
										</span>
									</li>
								)}
							</For>
						</ol>
					</div>
				</Show>

				{/* Action button */}
				<button
					type="button"
					class="mt-6 w-full py-3 rounded-lg bg-primary text-bg font-medium transition-colors hover:bg-primary/90 disabled:opacity-50"
					onClick={props.onStart}
					disabled={props.loading}
				>
					{props.loading
						? "Loading..."
						: props.progress
							? `Continue from Chapter ${props.progress.chapterIndex + 1}`
							: "Start Reading"}
				</button>
			</div>
		</div>
	);
}
