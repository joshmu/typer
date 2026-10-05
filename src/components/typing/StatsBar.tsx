import { type JSX, Show } from "solid-js";
import { isLiveWpmReady } from "@/lib/core/calc";
import { usePreferences } from "@/lib/preferences-context";

interface StatsBarProps {
	wpm: number;
	accuracy: number;
	elapsed: number;
	/** Character keys pressed so far. */
	typed: number;
}

function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

function Label(props: { children: JSX.Element }) {
	return (
		<span class="ml-1.5 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-text-sub">
			{props.children}
		</span>
	);
}

export default function StatsBar(props: StatsBarProps) {
	const [prefs] = usePreferences();
	const ready = () => isLiveWpmReady(props.elapsed, props.typed);
	return (
		<div
			class="mb-4 flex h-9 items-baseline gap-8 font-display tabular-nums"
			data-testid="stats-bar"
		>
			<Show when={prefs.showLiveWpm}>
				<div class="flex items-baseline">
					<Show
						when={ready()}
						fallback={
							// Warm-up: a quiet dot holds the number's place until the
							// reading is meaningful.
							<span
								class="inline-flex w-[1ch] items-center justify-center self-center text-3xl"
								data-testid="live-wpm"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-text-sub/60" />
								<span class="sr-only">measuring</span>
							</span>
						}
					>
						<span
							class="text-3xl leading-none font-semibold text-primary"
							data-testid="live-wpm"
						>
							{props.wpm}
						</span>
					</Show>
					<Label>wpm</Label>
				</div>
			</Show>
			<div class="flex items-baseline">
				<span class="text-xl leading-none font-medium text-text/75">
					{props.accuracy}
				</span>
				<Label>% acc</Label>
			</div>
			<div class="flex items-baseline">
				<span class="text-xl leading-none font-medium text-text/75">
					{formatTime(props.elapsed)}
				</span>
			</div>
		</div>
	);
}
