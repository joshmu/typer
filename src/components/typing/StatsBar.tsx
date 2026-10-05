import { Show } from "solid-js";
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

export default function StatsBar(props: StatsBarProps) {
	const [prefs] = usePreferences();
	return (
		<div
			class="flex gap-8 mb-4 text-text-sub text-lg font-mono"
			data-testid="stats-bar"
		>
			<Show when={prefs.showLiveWpm}>
				<div>
					<Show
						when={isLiveWpmReady(props.elapsed, props.typed)}
						fallback={
							<span
								class="text-text-sub text-2xl font-bold"
								data-testid="live-wpm"
							>
								–
							</span>
						}
					>
						<span
							class="text-primary text-2xl font-bold"
							data-testid="live-wpm"
						>
							{props.wpm}
						</span>
					</Show>{" "}
					<span class="text-sm">wpm</span>
				</div>
			</Show>
			<div>
				<span class="text-primary text-2xl font-bold">{props.accuracy}</span>
				<span class="text-sm">%</span>
			</div>
			<div>
				<span class="text-2xl font-bold">{formatTime(props.elapsed)}</span>
			</div>
		</div>
	);
}
