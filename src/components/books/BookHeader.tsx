import { chapterLabel, formatBookPercent } from "@/lib/book-format";
import type { BookMeta } from "@/lib/core/types/book";
import { isTypingActive } from "@/lib/typing-focus";
import BookThumb from "./BookThumb";
import { BOOK_SERIF } from "./typography";

interface BookHeaderProps {
	book: BookMeta;
	chapterIndex: number;
	chapterTitle?: string;
	/** Book percent from the book reader. */
	progressPercent: number;
	/** The committed position, so a started book never reads 0%. */
	position?: { chapterIndex: number; wordOffset: number };
	/** Leaves the book for the typing modes. */
	onClose: () => void;
}

/**
 * The book's identity in the mode bar's slot: it replaces the mode bar in
 * book mode, floats like it and fades out like it while typing.
 */
export default function BookHeader(props: BookHeaderProps) {
	const chapter = () => chapterLabel(props.chapterIndex, props.chapterTitle);
	const percent = () =>
		formatBookPercent(props.progressPercent, props.position);
	return (
		<div
			data-testid="book-header"
			class="absolute inset-x-0 top-4 z-10 flex justify-center px-4 motion-safe:transition-opacity motion-safe:duration-500"
			classList={{ "pointer-events-none opacity-0": isTypingActive() }}
			inert={isTypingActive()}
		>
			<div class="flex w-full max-w-lg items-center gap-3.5 rounded-xl bg-bg-secondary/50 py-2.5 pr-2.5 pl-3 font-display ring-1 ring-text/[0.07]">
				<BookThumb book={props.book} class="w-7" />
				<div class="min-w-0 flex-1">
					<p class="flex min-w-0 items-baseline gap-1.5 text-sm">
						<span
							class={`${BOOK_SERIF} truncate font-semibold text-text`}
							title={props.book.title}
						>
							{props.book.title}
						</span>
						<span class="shrink-0 text-text-sub">·</span>
						<span class="truncate text-text-sub" title={chapter()}>
							{chapter()}
						</span>
						<span class="ml-auto shrink-0 pl-2 tabular-nums text-primary">
							{percent()}
						</span>
					</p>
					<div class="mt-2 h-px overflow-hidden rounded-full bg-text/10">
						<div
							class="h-full rounded-full bg-primary/80 motion-safe:transition-[width] motion-safe:duration-500"
							style={{ width: `${props.progressPercent}%` }}
						/>
					</div>
				</div>
				<span class="h-6 w-px shrink-0 bg-text/10" aria-hidden="true" />
				<button
					type="button"
					aria-label="Close book"
					title="Close book"
					class="grid size-8 shrink-0 place-items-center rounded-lg text-text-sub outline-none motion-safe:transition-colors hover:bg-bg hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
					onClick={() => props.onClose()}
				>
					<svg
						viewBox="0 0 24 24"
						class="size-4"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M7 7l10 10M17 7L7 17" />
					</svg>
				</button>
			</div>
		</div>
	);
}
