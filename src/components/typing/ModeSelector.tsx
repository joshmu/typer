import { For, Show, createEffect, onMount } from "solid-js";
import type { TestMode } from "@/lib/core/types";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";

interface ModeSelectorProps {
	mode: TestMode;
	onModeChange: (mode: TestMode) => void;
}

const modeTypes = ["time", "words", "quote", "zen", "custom", "book"] as const;
const timeOptions = [15, 30, 60, 120] as const;
const wordOptions = [10, 25, 50, 100] as const;
const quoteOptions = ["short", "medium", "long"] as const;

export default function ModeSelector(props: ModeSelectorProps) {
	let containerRef: HTMLDivElement | undefined;
	let pillRef: HTMLDivElement | undefined;
	const buttonRefs: Record<string, HTMLButtonElement> = {};
	let hasMounted = false;

	function updatePill() {
		const btn = buttonRefs[props.mode.type];
		if (!btn || !pillRef || !containerRef) return;
		const containerRect = containerRef.getBoundingClientRect();
		const btnRect = btn.getBoundingClientRect();
		pillRef.style.width = `${btnRect.width}px`;
		pillRef.style.transform = `translateX(${btnRect.left - containerRect.left}px)`;
		if (!hasMounted || prefersReducedMotion()) {
			pillRef.style.transition = "none";
		} else {
			pillRef.style.transition = "transform 200ms ease-out, width 200ms ease-out";
		}
	}

	onMount(() => {
		updatePill();
		hasMounted = true;
	});

	createEffect(() => {
		// Track mode type to re-run effect
		const _ = props.mode.type;
		updatePill();
	});

	return (
		<div class="flex flex-col items-center gap-3 mb-8">
			{/* Mode type tabs */}
			<div
				ref={containerRef}
				class="relative flex items-center gap-1 bg-bg-secondary rounded-lg p-1"
			>
				{/* Sliding pill indicator */}
				<div
					ref={pillRef}
					class="absolute top-1 left-0 h-[calc(100%-8px)] bg-primary/15 rounded pointer-events-none"
				/>
				<For each={[...modeTypes]}>
					{(type, index) => (
						<>
							{index() === modeTypes.length - 1 && (
								<div class="w-px h-4 bg-text-sub/20 mx-0.5" />
							)}
							<button
								ref={(el) => { buttonRefs[type] = el; }}
								type="button"
								class={`relative z-10 px-4 py-1.5 text-sm rounded transition-colors ${
									props.mode.type === type
										? "text-primary"
										: "text-text-sub hover:text-text"
								}`}
								onClick={() => {
								switch (type) {
									case "time":
										props.onModeChange({ type: "time", seconds: 30 });
										break;
									case "words":
										props.onModeChange({ type: "words", count: 25 });
										break;
									case "quote":
										props.onModeChange({ type: "quote", length: "medium" });
										break;
									case "zen":
										props.onModeChange({ type: "zen" });
										break;
									case "custom":
										props.onModeChange({ type: "custom" });
										break;
									case "book":
										props.onModeChange({
											type: "book",
											bookId: "",
											chapterIndex: 0,
										});
										break;
								}
							}}
						>
							{type}
						</button>
						</>
					)}
				</For>
			</div>

			{/* Sub-options */}
			<Show when={props.mode.type === "time"}>
				<div class="flex gap-2">
					<For each={[...timeOptions]}>
						{(seconds) => (
							<button
								type="button"
								class={`px-3 py-1 text-xs rounded transition-colors ${
									props.mode.type === "time" &&
									props.mode.seconds === seconds
										? "text-primary bg-primary/10"
										: "text-text-sub hover:text-text"
								}`}
								onClick={() =>
									props.onModeChange({
										type: "time",
										seconds: seconds as 15 | 30 | 60 | 120,
									})
								}
							>
								{seconds}s
							</button>
						)}
					</For>
				</div>
			</Show>

			<Show when={props.mode.type === "words"}>
				<div class="flex gap-2">
					<For each={[...wordOptions]}>
						{(count) => (
							<button
								type="button"
								class={`px-3 py-1 text-xs rounded transition-colors ${
									props.mode.type === "words" && props.mode.count === count
										? "text-primary bg-primary/10"
										: "text-text-sub hover:text-text"
								}`}
								onClick={() =>
									props.onModeChange({
										type: "words",
										count: count as 10 | 25 | 50 | 100,
									})
								}
							>
								{count}
							</button>
						)}
					</For>
				</div>
			</Show>

			<Show when={props.mode.type === "quote"}>
				<div class="flex gap-2">
					<For each={[...quoteOptions]}>
						{(length) => (
							<button
								type="button"
								class={`px-3 py-1 text-xs rounded transition-colors ${
									props.mode.type === "quote" && props.mode.length === length
										? "text-primary bg-primary/10"
										: "text-text-sub hover:text-text"
								}`}
								onClick={() =>
									props.onModeChange({
										type: "quote",
										length: length as "short" | "medium" | "long",
									})
								}
							>
								{length}
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
