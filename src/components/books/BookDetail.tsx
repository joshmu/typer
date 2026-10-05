import { animate } from "motion";
import {
	createMemo,
	createResource,
	createSignal,
	For,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	chapterFills,
	chapterLabel,
	formatDuration,
	pickTypingPace,
	typingMinutes,
} from "@/lib/book-format";
import { useAverageWpm } from "@/lib/book-progress";
import { getCachedBook, loadBookDetail } from "@/lib/book-service";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";
import BookCover from "./BookCover";
import { BOOK_SERIF, LABEL_FACE } from "./typography";

interface BookDetailProps {
	book: BookMeta;
	progress?: BookProgress;
	/** Book percent from the book reader */
	percent: number;
	loading?: boolean;
	onStart: () => void;
	onClose: () => void;
}

/** Above this many chapters the progress strip is one continuous bar. */
const MAX_SEGMENTS = 60;

export default function BookDetail(props: BookDetailProps) {
	let panel: HTMLDivElement | undefined;
	let backdrop: HTMLButtonElement | undefined;
	let cta: HTMLButtonElement | undefined;

	const [detail] = createResource(
		() => props.book.id,
		(id) => loadBookDetail(id).catch(() => null),
	);
	const [chapterWords] = createResource(
		() => (props.progress ? props.book.id : false),
		async (id) =>
			(await getCachedBook(id))?.chapters.map((c) => c.wordCount) ?? null,
	);
	const averageWpm = useAverageWpm();

	const meta = createMemo<BookMeta>(() => {
		const d = detail();
		const base = props.progress?.bookMeta ?? props.book;
		if (!d) return { ...props.book, ...pickFilled(base) };
		return {
			...d,
			title: props.book.title || d.title,
			author: props.book.author || d.author,
			coverUrl: props.book.coverUrl || d.coverUrl,
		};
	});

	const chapterCount = () =>
		meta().chapters.length || props.progress?.bookMeta.chapters.length || 0;
	const pace = () =>
		pickTypingPace(props.progress?.averageWpm, averageWpm() ?? null);
	const wordsLeft = () => {
		const total = meta().wordCount;
		if (!props.progress) return total;
		return Math.round((total * (100 - props.percent)) / 100);
	};
	const paceLabel = () => {
		const p = pace();
		if (p.source === "book") return `at your ${p.wpm} WPM in this book`;
		if (p.source === "history") return `at your ${p.wpm} WPM average`;
		return `at ${p.wpm} WPM`;
	};
	const detailPending = () => detail.loading && !props.progress;
	const hasStats = () =>
		detailPending() || meta().wordCount > 0 || chapterCount() > 0;

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			props.onClose();
			return;
		}
		if (e.key === "Tab" && panel) trapFocus(panel, e);
	}

	onMount(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", onKeyDown, true);
		cta?.focus({ preventScroll: true });
		onCleanup(() => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", onKeyDown, true);
		});

		if (prefersReducedMotion() || !panel || !backdrop) return;
		const sheet = window.matchMedia("(max-width: 639px)").matches;
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.2 });
		animate(
			panel,
			{
				opacity: [0, 1],
				transform: sheet
					? ["translateY(24px)", "translateY(0)"]
					: ["translateY(12px) scale(0.98)", "translateY(0) scale(1)"],
			},
			{ duration: 0.28, ease: [0.16, 1, 0.3, 1] },
		);
	});

	return (
		<div class="fixed top-0 left-0 z-50 flex h-dvh w-dvw items-end justify-center sm:items-center sm:p-6">
			<button
				ref={backdrop}
				type="button"
				tabIndex={-1}
				aria-label="Close book details"
				class="absolute inset-0 cursor-default bg-bg/80 backdrop-blur-sm"
				onClick={props.onClose}
			/>
			<div
				ref={panel}
				role="dialog"
				aria-modal="true"
				aria-labelledby="book-detail-title"
				class="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-bg-secondary shadow-2xl ring-1 ring-text/10 sm:max-h-[min(44rem,88dvh)] sm:max-w-2xl sm:rounded-2xl"
			>
				<div class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-text/15 sm:hidden" />

				<button
					type="button"
					aria-label="Close"
					class="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full text-text-sub outline-none transition-colors hover:bg-bg/60 hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
					onClick={props.onClose}
				>
					<svg
						viewBox="0 0 24 24"
						class="size-[18px]"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>

				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 sm:px-8 sm:pt-8">
					<div class="grid grid-cols-[6.5rem_1fr] gap-x-5 gap-y-5 sm:grid-cols-[11rem_1fr] sm:grid-rows-[auto_1fr_auto] sm:gap-x-7 sm:gap-y-4">
						<div class="relative aspect-[2/3] w-full self-start overflow-hidden rounded-md shadow-xl ring-1 ring-text/10 sm:row-span-3">
							<BookCover
								bookId={meta().id}
								title={meta().title}
								author={meta().author}
								src={meta().coverUrl}
								eager
								compact
							/>
						</div>

						<div class="min-w-0 self-center pr-8 sm:self-start sm:pt-1">
							<h2
								id="book-detail-title"
								class={`${BOOK_SERIF} text-[1.35rem] leading-tight font-semibold text-text text-balance sm:text-[2rem]`}
							>
								{meta().title}
							</h2>
							<Show when={meta().author}>
								<p class="mt-1.5 text-sm text-text-sub">{meta().author}</p>
							</Show>
						</div>

						<div class="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-2">
							<Show
								when={!detailPending()}
								fallback={
									<div class="space-y-2.5 pt-1" aria-hidden="true">
										<div class="h-3 w-full rounded bg-text/10 motion-safe:animate-pulse" />
										<div class="h-3 w-11/12 rounded bg-text/10 motion-safe:animate-pulse" />
										<div class="h-3 w-2/3 rounded bg-text/10 motion-safe:animate-pulse" />
									</div>
								}
							>
								<Show when={meta().longDescription || meta().description}>
									{(text) => <Description text={text()} />}
								</Show>
							</Show>
						</div>

						<Show when={hasStats()}>
							<div class="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-3">
								<dl class="grid grid-cols-3 divide-x divide-text/10 rounded-lg bg-bg/40 py-3">
									<Stat label="words" pending={detailPending()}>
										{meta().wordCount > 0
											? meta().wordCount.toLocaleString()
											: null}
									</Stat>
									<Stat label="chapters" pending={detailPending()}>
										{chapterCount() > 0 ? chapterCount() : null}
									</Stat>
									<Stat
										label={props.progress ? "left to type" : "to type"}
										pending={detailPending()}
									>
										{meta().wordCount > 0
											? formatDuration(typingMinutes(wordsLeft(), pace().wpm))
											: null}
									</Stat>
								</dl>
								<Show when={meta().wordCount > 0 && !detailPending()}>
									<p class="mt-2 text-right text-[0.7rem] text-text-sub">
										Time estimated {paceLabel()}
									</p>
								</Show>
							</div>
						</Show>
					</div>

					<Show when={props.progress}>
						{(progress) => (
							<section
								class="mt-6 border-t border-text/10 pt-5"
								aria-label="Reading progress"
							>
								<div class="mb-2.5 flex items-baseline justify-between gap-3 text-xs">
									<span class="truncate text-text">
										{chapterLabel(progress().chapterIndex)}
										<Show when={chapterCount() > 0}>
											<span class="text-text-sub"> of {chapterCount()}</span>
										</Show>
									</span>
									<span class="shrink-0 tabular-nums text-primary">
										{props.percent}% read
									</span>
								</div>
								<ChapterStrip
									chapterWords={chapterWords() ?? null}
									chapterIndex={progress().chapterIndex}
									wordOffset={progress().wordOffset}
									percent={props.percent}
								/>
								<p class="mt-2.5 text-[0.7rem] text-text-sub">
									{progress().sessionCount} session
									{progress().sessionCount === 1 ? "" : "s"}
									<Show when={progress().averageWpm > 0}>
										{" "}
										· {Math.round(progress().averageWpm)} WPM average
									</Show>
								</p>
							</section>
						)}
					</Show>
				</div>

				<div class="flex shrink-0 items-center gap-4 border-t border-text/10 bg-bg-secondary px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
					<p class="hidden flex-1 text-xs text-text-sub sm:block">
						<kbd class="rounded border border-text/15 px-1.5 py-0.5 text-[0.65rem]">
							esc
						</kbd>{" "}
						to close
					</p>
					<button
						ref={cta}
						type="button"
						class={`${LABEL_FACE} flex h-12 flex-1 items-center justify-center gap-2.5 rounded-lg bg-primary px-7 text-base font-semibold text-bg outline-none transition-[filter,transform] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary active:scale-[0.98] disabled:opacity-60 sm:flex-none`}
						onClick={props.onStart}
						disabled={props.loading}
						aria-busy={props.loading}
					>
						<Show
							when={!props.loading}
							fallback={
								<>
									<span class="size-4 rounded-full border-2 border-bg/30 border-t-bg motion-safe:animate-spin" />
									Opening book
								</>
							}
						>
							{props.progress ? "Continue reading" : "Start reading"}
							<svg
								viewBox="0 0 24 24"
								class="size-4"
								fill="none"
								stroke="currentColor"
								stroke-width="2.25"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M5 12h14M13 6l6 6-6 6" />
							</svg>
						</Show>
					</button>
				</div>
			</div>
		</div>
	);
}

/** Catalog entries leave fields empty; keep whatever a progress record has. */
function pickFilled(meta: BookMeta): Partial<BookMeta> {
	return Object.fromEntries(
		Object.entries(meta).filter(([, v]) =>
			Array.isArray(v) ? v.length > 0 : Boolean(v),
		),
	);
}

/** Collapsed height of the description, in lines. */
const DESCRIPTION_LINES = 5;

function Description(props: { text: string }) {
	const [expanded, setExpanded] = createSignal(false);
	const [overflows, setOverflows] = createSignal(false);
	let body: HTMLDivElement | undefined;

	const measure = () => {
		if (body && !expanded()) {
			setOverflows(body.scrollHeight > body.clientHeight + 1);
		}
	};
	onMount(() => {
		measure();
		if (typeof ResizeObserver === "undefined" || !body) return;
		const observer = new ResizeObserver(measure);
		observer.observe(body);
		onCleanup(() => observer.disconnect());
	});

	return (
		<div>
			<div
				ref={body}
				id="book-detail-description"
				class={`${BOOK_SERIF} space-y-3 overflow-hidden text-[0.98rem] leading-relaxed text-text/85 text-pretty sm:text-[1.05rem] ${
					overflows() && !expanded()
						? "[mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
						: ""
				}`}
				style={
					expanded()
						? undefined
						: { "max-height": `${DESCRIPTION_LINES * 1.625}em` }
				}
			>
				<For each={props.text.split("\n\n")}>{(p) => <p>{p}</p>}</For>
			</div>
			<Show when={overflows() || expanded()}>
				<button
					type="button"
					class="mt-2 text-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
					aria-expanded={expanded()}
					aria-controls="book-detail-description"
					onClick={() => setExpanded((v) => !v)}
				>
					{expanded() ? "Less" : "More"}
				</button>
			</Show>
		</div>
	);
}

function Stat(props: {
	label: string;
	pending: boolean;
	children: JSX.Element;
}) {
	return (
		<div class="flex min-w-0 flex-col items-center px-2 text-center">
			<dt class="order-2 mt-0.5 text-[0.65rem] tracking-wide text-text-sub uppercase">
				{props.label}
			</dt>
			<dd
				class={`${LABEL_FACE} order-1 text-base font-semibold whitespace-nowrap text-text tabular-nums sm:text-lg`}
			>
				<Show
					when={!props.pending}
					fallback={
						<span class="my-1 inline-block h-4 w-12 rounded bg-text/10 align-middle motion-safe:animate-pulse" />
					}
				>
					{props.children ?? <span class="text-text-sub">–</span>}
				</Show>
			</dd>
		</div>
	);
}

function ChapterStrip(props: {
	chapterWords: number[] | null;
	chapterIndex: number;
	wordOffset: number;
	percent: number;
}) {
	const segments = () => {
		const words = props.chapterWords;
		if (!words || words.length < 2 || words.length > MAX_SEGMENTS) return null;
		const fills = chapterFills(words, props.chapterIndex, props.wordOffset);
		return words.map((w, i) => ({ grow: Math.max(w, 1), fill: fills[i] }));
	};

	return (
		<Show
			when={segments()}
			fallback={
				<div class="h-1.5 overflow-hidden rounded-full bg-bg">
					<div
						class="h-full rounded-full bg-primary"
						style={{ width: `${props.percent}%` }}
					/>
				</div>
			}
		>
			{(list) => (
				<div class="flex h-1.5 gap-[3px]" aria-hidden="true">
					<For each={list()}>
						{(segment) => (
							<div
								class="min-w-[3px] overflow-hidden rounded-full bg-bg"
								style={{ "flex-grow": segment.grow, "flex-basis": "0" }}
							>
								<div
									class="h-full bg-primary"
									style={{ width: `${segment.fill * 100}%` }}
								/>
							</div>
						)}
					</For>
				</div>
			)}
		</Show>
	);
}

function trapFocus(container: HTMLElement, e: KeyboardEvent) {
	const focusable = [
		...container.querySelectorAll<HTMLElement>(
			"button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
		),
	];
	if (focusable.length === 0) return;
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (e.shiftKey && document.activeElement === first) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && document.activeElement === last) {
		e.preventDefault();
		first.focus();
	}
}
