import { For, Show } from "solid-js";
import type { RunStats } from "@/lib/game/sim/run-stats";
import { VEIL } from "./veil";

interface DeathScreenProps {
	stats: RunStats;
	isNewBest: boolean;
	/** best score before this run, if there was one */
	previousBest: number | null;
	onRestart: () => void;
}

function formatDuration(seconds: number): string {
	const total = Math.round(seconds);
	const mins = Math.floor(total / 60);
	const secs = total % 60;
	return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

/**
 * Post-game overlay: the run's ending. The core has fallen, the score is the
 * hero number, the rest of the run's stats sit beneath it, and the next move
 * is one key away (R or a click, wired by GameShell).
 */
export default function DeathScreen(props: DeathScreenProps) {
	const cells = () => [
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
			class={`absolute inset-0 z-10 grid place-items-center overflow-y-auto py-16 ${VEIL}`}
			data-testid="game-over"
		>
			{/* the breach bleeds in from the edges */}
			<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,color-mix(in_srgb,var(--error)_22%,transparent)_100%)]" />
			<div class="relative flex flex-col items-center gap-8 px-6 text-center">
				<div class="flex flex-col items-center gap-3">
					<span class="font-display text-xs font-semibold uppercase tracking-[0.5em] text-error">
						The core has fallen
					</span>
					<h2 class="pl-[0.25em] font-display text-6xl font-black uppercase tracking-[0.25em] text-text sm:text-7xl">
						Overrun
					</h2>
					<p class="font-display text-sm text-text-sub">
						You held until wave {props.stats.wave} for{" "}
						{formatDuration(props.stats.durationSeconds)}
					</p>
				</div>

				<div class="flex flex-col items-center gap-2">
					<span class="font-display text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-text-sub">
						Final score
					</span>
					<span
						class="font-display text-6xl font-black tabular-nums text-primary drop-shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_40%,transparent)] sm:text-7xl"
						data-testid="game-over-score"
					>
						{props.stats.score}
					</span>
					<Show
						when={props.isNewBest}
						fallback={
							<Show when={props.previousBest !== null}>
								<span class="font-display text-xs uppercase tracking-[0.25em] text-text-sub">
									best{" "}
									<span class="tabular-nums text-text">
										{props.previousBest}
									</span>
								</span>
							</Show>
						}
					>
						<span
							class="rounded-full bg-primary px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.25em] text-on-primary"
							data-testid="game-new-best"
						>
							New best
							<Show when={props.previousBest !== null}>
								{" "}
								<span class="tabular-nums">
									+{props.stats.score - (props.previousBest ?? 0)}
								</span>
							</Show>
						</span>
					</Show>
				</div>

				<div class="grid grid-cols-3 gap-x-8 gap-y-5 rounded-xl border border-text/10 bg-bg/60 px-8 py-5 sm:grid-cols-5">
					<For each={cells()}>
						{(cell) => (
							<div class="flex flex-col items-center gap-1">
								<span class="font-display text-[0.65rem] uppercase tracking-[0.3em] text-text-sub">
									{cell.label}
								</span>
								<span
									class="font-display text-2xl font-bold tabular-nums text-text"
									data-testid={cell.testid}
								>
									{cell.value}
								</span>
							</div>
						)}
					</For>
				</div>

				<div class="flex items-center gap-3">
					<button
						type="button"
						onClick={() => props.onRestart()}
						data-testid="game-restart"
						class="rounded-lg bg-primary px-6 py-2.5 font-display text-sm font-bold uppercase tracking-[0.25em] text-on-primary outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-text"
					>
						Play again{" "}
						<kbd class="ml-1 rounded bg-on-primary/15 px-1.5 py-0.5 text-xs">
							R
						</kbd>
					</button>
					<a
						href="/"
						class="rounded-lg border border-text/15 px-5 py-2.5 font-display text-sm uppercase tracking-[0.25em] text-text-sub no-underline transition-colors hover:text-text"
					>
						Home
					</a>
				</div>
			</div>
		</div>
	);
}
