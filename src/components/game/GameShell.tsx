import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { GameLoop } from "@/lib/game/render/loop";
import { COMBO_DECAY_TICKS, comboMultiplier } from "@/lib/game/sim/score";
import type { GameState } from "@/lib/game/sim/state";

declare global {
	interface Window {
		__game?: {
			getState(): GameState;
			sendKeys(keys: string): void;
			stepTicks(n: number): void;
		};
	}
}

export default function GameShell() {
	let canvasRef: HTMLCanvasElement | undefined;
	let loop: GameLoop | undefined;
	let disposed = false;
	const [hud, setHud] = createSignal<GameState | null>(null);
	const [ready, setReady] = createSignal(false);

	const params = new URLSearchParams(window.location.search);
	// a malformed ?seed (e.g. "abc") must not poison the sim with NaN; fall back
	// to a time-based seed (Date.now is fine here — shell code, not the sim)
	const raw = params.get("seed");
	const parsed = raw === null ? Number.NaN : Number(raw);
	const seed = Number.isFinite(parsed) ? parsed : Date.now() % 2 ** 31;
	const testMode = params.get("testMode") === "1";

	onMount(async () => {
		const { startGameLoop } = await import("@/lib/game/render/loop");
		// the component may have unmounted during the dynamic import
		if (disposed || !canvasRef) return;
		loop = startGameLoop({
			canvas: canvasRef,
			seed,
			testMode,
			onState: setHud,
		});
		// re-check: if cleanup ran between the import and now, tear down safely
		if (disposed) {
			loop.dispose();
			loop = undefined;
			return;
		}
		if (testMode) {
			const activeLoop = loop;
			window.__game = {
				getState: () => activeLoop.getState(),
				sendKeys: (keys) => {
					for (const k of keys) activeLoop.pushKey(k);
				},
				stepTicks: (n) => activeLoop.stepTicks(n),
			};
		}
		setReady(true);
	});

	onCleanup(() => {
		disposed = true;
		loop?.dispose();
		if (testMode) window.__game = undefined;
	});

	function onKeyDown(e: KeyboardEvent) {
		if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
		// stop the browser acting on gameplay keys (space scroll, quick-find, …)
		e.preventDefault();
		loop?.pushKey(e.key);
	}

	onMount(() => {
		window.addEventListener("keydown", onKeyDown);
		onCleanup(() => window.removeEventListener("keydown", onKeyDown));
	});

	return (
		<div class="relative h-[calc(100vh-8rem)] w-full" data-testid="game-shell">
			<canvas ref={canvasRef} class="h-full w-full outline-none" />
			<Show when={!ready()}>
				<div class="absolute inset-0 grid place-items-center text-sm opacity-70">
					Loading arena…
				</div>
			</Show>
			<Show when={hud()}>
				{(state) => (
					<>
						{/* top-center: score, hearts, kills */}
						<div class="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-6 font-mono text-sm">
							<span data-testid="game-score">score {state().score}</span>
							<span data-testid="game-hp" class="flex gap-0.5 text-base">
								<For each={Array.from({ length: state().maxPlayerHp })}>
									{(_, i) => (
										<span
											class={
												i() < state().playerHp ? "text-rose-400" : "opacity-30"
											}
										>
											{i() < state().playerHp ? "♥" : "♡"}
										</span>
									)}
								</For>
							</span>
							<span data-testid="game-kills">kills {state().kills}</span>
						</div>

						{/* top-left: active wave chip + combo meter */}
						<div class="pointer-events-none absolute top-3 left-3 flex flex-col gap-2 font-mono text-xs">
							<Show when={state().wavePhase === "active"}>
								<span
									data-testid="game-wave"
									class="rounded bg-white/10 px-2 py-1"
								>
									wave {state().wave}
								</span>
							</Show>
							<Show when={state().combo > 0}>
								<div
									data-testid="game-combo"
									class="w-28 rounded bg-white/10 px-2 py-1"
								>
									<div class="flex justify-between">
										<span>combo {state().combo}</span>
										<span class="text-amber-300">
											&times;{comboMultiplier(state().combo)}
										</span>
									</div>
									<div class="mt-1 h-1 w-full overflow-hidden rounded bg-white/10">
										<div
											class="h-full bg-amber-400 transition-[width] duration-100"
											style={{
												width: `${Math.min(100, (state().comboTicksLeft / COMBO_DECAY_TICKS) * 100)}%`,
											}}
										/>
									</div>
								</div>
							</Show>
						</div>

						{/* center: wave-incoming banner during intermission */}
						<Show
							when={state().wavePhase === "intermission" && state().wave > 0}
						>
							<div class="pointer-events-none absolute inset-x-0 top-1/3 text-center font-mono text-2xl font-bold tracking-widest text-amber-300 animate-pulse">
								WAVE {state().wave + 1} INCOMING
							</div>
						</Show>
					</>
				)}
			</Show>
			<Show when={hud()?.status === "gameover"}>
				<div
					class="absolute inset-0 grid place-items-center bg-black/60"
					data-testid="game-over"
				>
					<div class="text-center">
						<p class="text-2xl font-bold">Run over</p>
						<p class="mt-2 font-mono">score {hud()?.score}</p>
					</div>
				</div>
			</Show>
		</div>
	);
}
