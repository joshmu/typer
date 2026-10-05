import { chapterLabel } from "@/lib/book-format";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";
import BookCover from "./BookCover";
import { BOOK_SERIF } from "./typography";

interface BookCardProps {
	book: BookMeta;
	progress?: BookProgress;
	/** Book percent from the book reader */
	percent: number;
	onClick: (book: BookMeta, trigger: HTMLElement) => void;
	/** Position in its grid, for the cover fade-in stagger. */
	index?: number;
	/** Width classes; defaults to filling its grid cell. */
	class?: string;
}

export default function BookCard(props: BookCardProps) {
	return (
		<button
			type="button"
			class={`group flex min-w-0 flex-col gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-bg ${props.class ?? "w-full"}`}
			onClick={(e) => props.onClick(props.book, e.currentTarget)}
		>
			<div class="relative aspect-[2/3] w-full overflow-hidden rounded-md shadow-md ring-1 ring-text/10 motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:ease-out group-hover:shadow-xl group-hover:ring-primary/50 group-focus-visible:ring-primary/50 motion-safe:group-hover:-translate-y-1 motion-safe:group-focus-visible:-translate-y-1">
				<BookCover
					bookId={props.book.id}
					title={props.book.title}
					author={props.book.author}
					src={props.book.coverUrl}
					index={props.index}
				/>

				{props.progress && (
					<div class="absolute inset-x-0 bottom-0 h-1 bg-bg/70">
						<div
							class="h-full bg-primary"
							style={{ width: `${props.percent}%` }}
						/>
					</div>
				)}
			</div>

			<div class="min-w-0 px-0.5">
				<p
					class={`${BOOK_SERIF} text-[0.95rem] font-semibold leading-snug text-text line-clamp-2 motion-safe:transition-colors group-hover:text-primary`}
					title={props.book.title}
				>
					{props.book.title}
				</p>
				<p
					class="mt-0.5 truncate text-xs text-text-sub"
					title={props.book.author}
				>
					{props.book.author}
				</p>
				{props.progress ? (
					<p class="mt-1 truncate text-xs text-primary">
						{chapterLabel(props.progress.chapterIndex)} · {props.percent}%
					</p>
				) : (
					props.book.wordCount > 0 && (
						<p class="mt-1 text-xs text-text-sub">
							{Math.round(props.book.wordCount / 1000)}k words
						</p>
					)
				)}
			</div>
		</button>
	);
}
