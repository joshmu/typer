import { For, Show } from "solid-js";
import type { GameRun } from "@/lib/db";
import { VEIL } from "./veil";

interface StartScreenProps {
	bestRun?: GameRun;
	onStart: () => void;
}

const CONTROLS = [
	{ keys: "a–z", label: "type to shoot" },
	{ keys: "Backspace", label: "drop target" },
	{ keys: "Esc", label: "pause" },
] as const;

/**
 * Pre-game overlay: shown before the first keypress. Explains the one-rule
 * mechanic and surfaces the persisted best run. Any key (Enter and Space
 * included) or a click dismisses it and starts the run (wired by GameShell).
 */
export default function StartScreen(props: StartScreenProps) {
	return (
		<div
			class={`absolute inset-0 grid place-items-center overflow-y-auto py-20 ${VEIL}`}
			data-testid="game-start"
		>
			<div class="flex flex-col items-center gap-8 px-6 text-center">
				<div class="flex flex-col items-center gap-3">
					<span class="font-display text-xs font-semibold uppercase tracking-[0.5em] text-text-sub">
						typing survival
					</span>
					<h1 class="pl-[0.3em] font-display text-7xl font-black uppercase tracking-[0.3em] text-primary drop-shadow-[0_0_28px_color-mix(in_srgb,var(--primary)_45%,transparent)] sm:text-8xl">
						Horde
					</h1>
				</div>
				<p class="max-w-md text-sm leading-relaxed text-text">
					Type the word above an enemy to shoot it. Keep the swarm off the core
					and chain kills for combo multipliers.
				</p>
				<ul class="flex flex-wrap justify-center gap-x-6 gap-y-2 font-display text-xs text-text-sub">
					<For each={CONTROLS}>
						{(c) => (
							<li class="flex items-center gap-2">
								<kbd class="rounded-md border border-text/20 bg-text/10 px-2 py-0.5 text-text">
									{c.keys}
								</kbd>
								{c.label}
							</li>
						)}
					</For>
				</ul>
				<Show when={props.bestRun}>
					{(best) => (
						<div
							class="flex items-center gap-6 rounded-xl border border-text/10 bg-bg/60 px-5 py-3 font-display"
							data-testid="game-start-best"
						>
							<span class="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-text-sub">
								Best run
							</span>
							<span class="flex items-baseline gap-1.5 text-xs text-text-sub">
								<span class="text-lg font-bold tabular-nums text-primary">
									{best().score}
								</span>
								score
							</span>
							<span class="flex items-baseline gap-1.5 text-xs text-text-sub">
								<span class="text-lg font-bold tabular-nums text-text">
									{best().wave}
								</span>
								wave
							</span>
							<span class="flex items-baseline gap-1.5 text-xs text-text-sub">
								<span class="text-lg font-bold tabular-nums text-text">
									{best().wpm}
								</span>
								wpm
							</span>
						</div>
					)}
				</Show>
				<button
					type="button"
					onClick={() => props.onStart()}
					class="mt-2 rounded-lg px-4 py-2 font-display text-sm font-semibold uppercase tracking-[0.35em] text-text outline-none focus-visible:ring-2 focus-visible:ring-primary motion-safe:animate-pulse"
				>
					Press any key
				</button>
			</div>
		</div>
	);
}
