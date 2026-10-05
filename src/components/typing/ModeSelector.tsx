import { useNavigate } from "@solidjs/router";
import {
	createEffect,
	For,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import type { TestMode } from "@/lib/core/types";
import { isTypingActive } from "@/lib/typing-focus";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";

const wordListOptions = ["200", "1k", "5k"] as const;

interface ModeSelectorProps {
	mode: TestMode;
	onModeChange: (mode: TestMode) => void;
	wordListSize: "200" | "1k" | "5k";
	onWordListSizeChange: (size: "200" | "1k" | "5k") => void;
}

const modeTypes = ["time", "words", "quote", "zen", "custom", "book"] as const;
const timeOptions = [15, 30, 60, 120] as const;
const wordOptions = [10, 25, 50, 100] as const;
const quoteOptions = ["short", "medium", "long"] as const;

const defaultMode: Record<(typeof modeTypes)[number], TestMode> = {
	time: { type: "time", seconds: 30 },
	words: { type: "words", count: 25 },
	quote: { type: "quote", length: "medium" },
	zen: { type: "zen" },
	custom: { type: "custom" },
	book: { type: "book", bookId: "", chapterIndex: 0 },
};

const PILL_EASE = "220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
const TAB_CLASS =
	"relative z-10 shrink-0 snap-center rounded-lg px-3.5 py-1.5 font-display text-sm font-medium tracking-wide transition-colors sm:px-4";

function Divider() {
	return <div class="mx-1 h-4 w-px shrink-0 bg-text-sub/25" />;
}

function OptionButton(props: {
	active: boolean;
	onClick: () => void;
	children: JSX.Element;
}) {
	return (
		<button
			type="button"
			class="rounded-md px-2.5 py-1 font-display text-xs font-medium tracking-wide transition-colors"
			classList={{
				"text-primary bg-primary/10": props.active,
				"text-text-sub hover:text-text": !props.active,
			}}
			onClick={props.onClick}
		>
			{props.children}
		</button>
	);
}

/**
 * The mode bar sits at the same spot in every mode: the tab row, then a
 * sub-option slot of constant height. It is positioned out of flow, so it
 * never pushes the typing stage and takes no space while hidden in a test.
 */
export default function ModeSelector(props: ModeSelectorProps) {
	const navigate = useNavigate();
	let scrollRef: HTMLDivElement | undefined;
	let containerRef: HTMLDivElement | undefined;
	let pillRef: HTMLDivElement | undefined;
	const buttonRefs: Record<string, HTMLButtonElement> = {};
	let hasMounted = false;

	function updatePill(animate = hasMounted) {
		const btn = buttonRefs[props.mode.type];
		if (!btn || !pillRef || !containerRef) return;
		const containerRect = containerRef.getBoundingClientRect();
		const btnRect = btn.getBoundingClientRect();
		pillRef.style.width = `${btnRect.width}px`;
		pillRef.style.transform = `translateX(${btnRect.left - containerRect.left}px)`;
		pillRef.style.transition =
			animate && !prefersReducedMotion()
				? `transform ${PILL_EASE}, width ${PILL_EASE}`
				: "none";
	}

	// Edge fades show only on a side with more tabs to scroll to.
	function updateFades() {
		if (!scrollRef) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollRef;
		scrollRef.toggleAttribute("data-fade-left", scrollLeft > 1);
		scrollRef.toggleAttribute(
			"data-fade-right",
			scrollLeft + clientWidth < scrollWidth - 1,
		);
	}

	function revealActive() {
		const btn = buttonRefs[props.mode.type];
		if (!btn || !scrollRef || scrollRef.scrollWidth <= scrollRef.clientWidth)
			return;
		scrollRef.scrollLeft =
			btn.offsetLeft - (scrollRef.clientWidth - btn.offsetWidth) / 2;
	}

	const relayout = () => {
		updatePill(false);
		updateFades();
	};

	onMount(() => {
		revealActive();
		relayout();
		hasMounted = true;
		// Tab widths change once the display font swaps in.
		document.fonts?.ready.then(() => {
			revealActive();
			relayout();
		});
		window.addEventListener("resize", relayout);
		onCleanup(() => window.removeEventListener("resize", relayout));
	});

	createEffect(() => {
		// Track mode type to re-run effect
		const _ = props.mode.type;
		updatePill();
	});

	const showsWordList = () =>
		props.mode.type === "time" || props.mode.type === "words";

	return (
		<div
			data-testid="mode-selector"
			class="absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-3 px-4 transition-opacity duration-500"
			classList={{ "opacity-0 pointer-events-none": isTypingActive() }}
			inert={isTypingActive()}
		>
			<div
				ref={scrollRef}
				class="mode-scroll max-w-full snap-x snap-proximity overflow-x-auto"
				onScroll={updateFades}
			>
				<div
					ref={containerRef}
					class="relative flex w-max items-center gap-0.5 rounded-xl bg-bg-secondary p-1"
				>
					{/* Sliding pill indicator */}
					<div
						ref={pillRef}
						class="pointer-events-none absolute top-1 left-0 h-[calc(100%-8px)] rounded-lg bg-primary/15"
					/>
					<For each={[...modeTypes]}>
						{(type, index) => (
							<>
								{index() === modeTypes.length - 1 && <Divider />}
								<button
									ref={(el) => {
										buttonRefs[type] = el;
									}}
									type="button"
									class={TAB_CLASS}
									classList={{
										"text-primary": props.mode.type === type,
										"text-text-sub hover:text-text": props.mode.type !== type,
									}}
									onClick={() => props.onModeChange(defaultMode[type])}
								>
									{type}
								</button>
							</>
						)}
					</For>
					{/* The game is a separate arcade mode: it navigates away and is
					    never the active tab here. */}
					<Divider />
					<button
						type="button"
						data-testid="mode-horde"
						class={`${TAB_CLASS} text-text-sub hover:text-text`}
						onClick={() => navigate("/game")}
					>
						game
					</button>
				</div>
			</div>

			{/* Sub-option slot: constant height in every mode */}
			<div
				class="flex h-8 items-center justify-center gap-1"
				data-testid="mode-options"
			>
				<Show when={props.mode.type === "time"}>
					<For each={[...timeOptions]}>
						{(seconds) => (
							<OptionButton
								active={
									props.mode.type === "time" && props.mode.seconds === seconds
								}
								onClick={() =>
									props.onModeChange({
										type: "time",
										seconds: seconds as 15 | 30 | 60 | 120,
									})
								}
							>
								{seconds}s
							</OptionButton>
						)}
					</For>
				</Show>

				<Show when={props.mode.type === "words"}>
					<For each={[...wordOptions]}>
						{(count) => (
							<OptionButton
								active={
									props.mode.type === "words" && props.mode.count === count
								}
								onClick={() =>
									props.onModeChange({
										type: "words",
										count: count as 10 | 25 | 50 | 100,
									})
								}
							>
								{count}
							</OptionButton>
						)}
					</For>
				</Show>

				<Show when={showsWordList()}>
					<Divider />
					<For each={[...wordListOptions]}>
						{(size) => (
							<OptionButton
								active={props.wordListSize === size}
								onClick={() => props.onWordListSizeChange(size)}
							>
								{size}
							</OptionButton>
						)}
					</For>
				</Show>

				<Show when={props.mode.type === "quote"}>
					<For each={[...quoteOptions]}>
						{(length) => (
							<OptionButton
								active={
									props.mode.type === "quote" && props.mode.length === length
								}
								onClick={() =>
									props.onModeChange({
										type: "quote",
										length: length as "short" | "medium" | "long",
									})
								}
							>
								{length}
							</OptionButton>
						)}
					</For>
				</Show>
			</div>
		</div>
	);
}
