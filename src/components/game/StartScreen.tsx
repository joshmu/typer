import { Show } from "solid-js";
import type { GameRun } from "@/lib/db";

interface StartScreenProps {
	bestRun?: GameRun;
}

/**
 * Pre-game overlay: shown before the first keypress. Explains the one-rule
 * mechanic and surfaces the persisted best run. Any key dismisses it and
 * starts the loop (handled by GameShell).
 */
export default function StartScreen(props: StartScreenProps) {
	return (
		<div
			class="absolute inset-0 grid place-items-center bg-bg/80 backdrop-blur-sm"
			data-testid="game-start"
		>
			<div class="flex flex-col items-center gap-6 text-center px-8">
				<h1 class="font-display text-5xl font-bold uppercase tracking-[0.2em] text-primary">
					Game
				</h1>
				<p class="max-w-sm font-mono text-sm text-text-sub">
					Type the word above an enemy to shoot it. Keep the swarm off the core
					— chain kills for combo multipliers.
				</p>
				<Show when={props.bestRun}>
					{(best) => (
						<div
							class="flex items-center gap-6 font-mono text-xs text-text-sub"
							data-testid="game-start-best"
						>
							<span class="font-display uppercase tracking-widest">Best</span>
							<span>
								score <span class="text-text font-bold">{best().score}</span>
							</span>
							<span>
								wave <span class="text-text font-bold">{best().wave}</span>
							</span>
							<span>
								{best().wpm} <span class="opacity-60">wpm</span>
							</span>
						</div>
					)}
				</Show>
				<p class="mt-2 animate-pulse font-display text-sm uppercase tracking-[0.3em] text-text">
					Press any key
				</p>
			</div>
		</div>
	);
}
