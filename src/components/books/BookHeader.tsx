import { Show } from "solid-js";
import { chapterLabel } from "@/lib/book-format";
import type { BookMeta } from "@/lib/core/types/book";
import { isTypingActive } from "@/lib/typing-focus";

interface BookHeaderProps {
	book: BookMeta;
	chapterIndex: number;
	chapterTitle?: string;
	progressPercent: number;
	/** Leaves the book for the typing modes. */
	onClose?: () => void;
}

export default function BookHeader(props: BookHeaderProps) {
	return (
		<div class="w-full max-w-4xl mx-auto mb-4" data-testid="book-header">
			<div class="flex items-center justify-between gap-4 text-sm text-text-sub">
				<span class="truncate">
					{props.book.title} ·{" "}
					{chapterLabel(props.chapterIndex, props.chapterTitle)}
				</span>
				<span class="flex shrink-0 items-center gap-2">
					<span class="tabular-nums">{props.progressPercent}%</span>
					<Show when={props.onClose}>
						{(close) => (
							<button
								type="button"
								aria-label="Close book"
								title="Close book"
								class="-my-1 -mr-1.5 grid size-7 place-items-center rounded-md text-text-sub/70 outline-none transition-[color,background-color,opacity] duration-300 hover:bg-bg-secondary hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
								classList={{
									"pointer-events-none opacity-0": isTypingActive(),
								}}
								inert={isTypingActive()}
								onClick={() => close()()}
							>
								<svg
									viewBox="0 0 24 24"
									class="size-3.5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									aria-hidden="true"
								>
									<path d="M7 7l10 10M17 7L7 17" />
								</svg>
							</button>
						)}
					</Show>
				</span>
			</div>
			<div class="mt-1 h-0.5 bg-bg-secondary rounded-full overflow-hidden">
				<div
					class="h-full bg-primary/40 transition-all"
					style={{ width: `${props.progressPercent}%` }}
				/>
			</div>
		</div>
	);
}
