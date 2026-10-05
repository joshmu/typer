import { type JSX, Show } from "solid-js";
import {
	chapterLabel,
	coverToneBackground,
	formatBookPercent,
} from "@/lib/book-format";
import type { ResumableBook } from "@/lib/book-progress";
import { BOOK_SERIF } from "./typography";

interface ContinueCardProps {
	/** undefined while loading, then the book to resume or null for none. */
	resumable: { book: ResumableBook | null } | undefined;
	onContinue: (resumable: ResumableBook) => void;
	/** Faded out and out of the tab order, e.g. while typing. */
	hidden?: boolean;
}

const SHELL =
	"group mx-auto flex w-full max-w-md items-center gap-4 rounded-xl font-display bg-bg-secondary/50 px-4 py-3 text-left no-underline ring-1 ring-text/[0.07] outline-none motion-safe:transition-[background-color,box-shadow,transform] motion-safe:duration-200 hover:bg-bg-secondary hover:ring-primary/35 focus-visible:ring-2 focus-visible:ring-primary motion-safe:active:scale-[0.99]";
const EYEBROW =
	"font-display text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-text-sub";

function Arrow() {
	return (
		<svg
			viewBox="0 0 24 24"
			class="size-4 shrink-0 text-text-sub motion-safe:transition-[transform,color] motion-safe:duration-200 group-hover:text-primary group-focus-visible:text-primary motion-safe:group-hover:translate-x-0.5"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M5 12h14M13 6l6 6-6 6" />
		</svg>
	);
}

/**
 * A quiet way into books from the typing screen: continue the book in
 * progress, or open the library.
 */
export default function ContinueCard(props: ContinueCardProps) {
	const hidden = () => props.hidden || props.resumable === undefined;
	return (
		<div
			class="motion-safe:transition-opacity motion-safe:duration-500"
			classList={{ "pointer-events-none opacity-0": hidden() }}
			inert={hidden()}
			data-testid="continue-card"
		>
			<Show when={props.resumable?.book} fallback={<LibraryLink />} keyed>
				{(r) => <ContinueButton resumable={r} onContinue={props.onContinue} />}
			</Show>
		</div>
	);
}

function ContinueButton(props: {
	resumable: ResumableBook;
	onContinue: (resumable: ResumableBook) => void;
}): JSX.Element {
	const meta = () => props.resumable.book.meta;
	const percent = () =>
		formatBookPercent(props.resumable.percent, props.resumable.progress);
	const chapter = () =>
		chapterLabel(props.resumable.chapterIndex, props.resumable.chapterTitle);
	return (
		<button
			type="button"
			class={SHELL}
			onClick={() => props.onContinue(props.resumable)}
			aria-label={`Continue reading ${meta().title}, ${chapter()}, ${percent()}`}
		>
			<div
				class="relative aspect-[2/3] w-8 shrink-0 overflow-hidden rounded-[3px] shadow-sm ring-1 ring-text/10"
				style={{ background: coverToneBackground(meta().id) }}
				aria-hidden="true"
			>
				<Show when={meta().coverUrl}>
					<img
						src={meta().coverUrl}
						alt=""
						decoding="async"
						class="absolute inset-0 h-full w-full object-cover"
						onError={(e) => e.currentTarget.remove()}
					/>
				</Show>
			</div>
			<div class="min-w-0 flex-1">
				<p class={EYEBROW}>Continue reading</p>
				<p class="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-sm text-text">
					<span class={`${BOOK_SERIF} truncate font-semibold`}>
						{meta().title}
					</span>
					<span class="shrink-0 text-text-sub">·</span>
					<span class="truncate text-text-sub">{chapter()}</span>
					<span class="shrink-0 text-text-sub">·</span>
					<span class="shrink-0 tabular-nums text-primary">{percent()}</span>
				</p>
				<div class="mt-2 h-0.5 overflow-hidden rounded-full bg-text/10">
					<div
						class="h-full rounded-full bg-primary/70"
						style={{ width: `${props.resumable.percent}%` }}
					/>
				</div>
			</div>
			<Arrow />
		</button>
	);
}

function LibraryLink(): JSX.Element {
	return (
		<a href="/library" class={SHELL}>
			<svg
				viewBox="0 0 24 24"
				class="size-5 shrink-0 text-primary/80"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M12 6.5C10.3 5.2 7.8 4.5 4 4.5v13c3.8 0 6.3.7 8 2 1.7-1.3 4.2-2 8-2v-13c-3.8 0-6.3.7-8 2z" />
				<path d="M12 6.5v13" />
			</svg>
			<div class="min-w-0 flex-1">
				<p class="text-sm text-text">Type a classic book</p>
				<p class="mt-0.5 truncate text-xs text-text-sub">
					Public-domain novels, a chapter at a time
				</p>
			</div>
			<Arrow />
		</a>
	);
}
