import { For, Show } from "solid-js";
import type { TestMode } from "@/lib/core/types";

interface ModeSelectorProps {
	mode: TestMode;
	onModeChange: (mode: TestMode) => void;
}

const modeTypes = ["time", "words", "quote", "zen", "custom"] as const;
const timeOptions = [15, 30, 60, 120] as const;
const wordOptions = [10, 25, 50, 100] as const;
const quoteOptions = ["short", "medium", "long"] as const;

export default function ModeSelector(props: ModeSelectorProps) {
	return (
		<div class="flex flex-col items-center gap-3 mb-8">
			{/* Mode type tabs */}
			<div class="flex gap-1 bg-bg-secondary rounded-lg p-1">
				<For each={[...modeTypes]}>
					{(type) => (
						<button
							type="button"
							class={`px-4 py-1.5 text-sm rounded transition-colors ${
								props.mode.type === type
									? "bg-primary/15 text-primary"
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
								}
							}}
						>
							{type}
						</button>
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
