import { For, Show } from "solid-js";
import type { RunStats } from "@/lib/game/sim/run-stats";

interface DeathScreenProps {
	stats: RunStats;
	isNewBest: boolean;
	onRestart: () => void;
}

function formatDuration(seconds: number): string {
	const total = Math.round(seconds);
	const mins = Math.floor(total / 60);
	const secs = total % 60;
	return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

/**
 * Post-game overlay: final run summary derived from sim state, with a NEW BEST
 * badge and restart affordance (R or click, wired by GameShell).
 */
export default function DeathScreen(props: DeathScreenProps) {
	const cells = () => [
		{
			testid: "game-over-score",
			label: "score",
			value: `${props.stats.score}`,
		},
		{ testid: "game-over-wave", label: "wave", value: `${props.stats.wave}` },
		{
			testid: "game-over-kills",
			label: "kills",
			value: `${props.stats.kills}`,
		},
		{ testid: "game-over-wpm", label: "wpm", value: `${props.stats.wpm}` },
		{
			testid: "game-over-accuracy",
			label: "accuracy",
			value: `${Math.round(props.stats.accuracy)}%`,
		},
		{
			testid: "game-over-duration",
			label: "time",
			value: formatDuration(props.stats.durationSeconds),
		},
	];

	return (
		<div
			class="absolute inset-0 grid place-items-center bg-bg/80 backdrop-blur-sm"
			data-testid="game-over"
		>
			<div class="flex flex-col items-center gap-6 px-8">
				<div class="flex flex-col items-center gap-2">
					<Show when={props.isNewBest}>
						<span
							class="rounded-full bg-primary px-3 py-1 font-display text-xs font-bold uppercase tracking-widest text-bg"
							data-testid="game-new-best"
						>
							New Best
						</span>
					</Show>
					<h2 class="font-display text-3xl font-bold uppercase tracking-[0.2em] text-text">
						Run Over
					</h2>
				</div>

				<div class="grid grid-cols-3 gap-x-8 gap-y-5">
					<For each={cells()}>
						{(cell) => (
							<div class="flex flex-col items-center gap-1">
								<span class="font-display text-[0.65rem] uppercase tracking-widest text-text-sub">
									{cell.label}
								</span>
								<span
									class="font-mono text-2xl font-bold text-text"
									data-testid={cell.testid}
								>
									{cell.value}
								</span>
							</div>
						)}
					</For>
				</div>

				<button
					type="button"
					onClick={() => props.onRestart()}
					data-testid="game-restart"
					class="mt-2 rounded-lg border border-primary/40 px-6 py-2 font-display text-sm uppercase tracking-widest text-primary transition-colors hover:bg-primary/10"
				>
					Restart <span class="opacity-60">(R)</span>
				</button>
			</div>
		</div>
	);
}
