import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import type { GameLoop } from "@/lib/game/render/loop";
import { deriveRunStats } from "@/lib/game/sim/run-stats";
import { COMBO_DECAY_TICKS, comboMultiplier } from "@/lib/game/sim/score";
import type { GameState } from "@/lib/game/sim/state";
import { getBestRun, saveGameRun, useBestRun } from "@/lib/game-runs";
import DeathScreen from "./DeathScreen";
import StartScreen from "./StartScreen";

declare global {
	interface Window {
		__game?: {
			getState(): GameState;
			sendKeys(keys: string): void;
			sendBackspace(): void;
			stepTicks(n: number): void;
			renderReady(): boolean;
		};
	}
}

export default function GameShell() {
	let canvasRef: HTMLCanvasElement | undefined;
	let loop: GameLoop | undefined;
	let disposed = false;
	let startLoop:
		| ((seed: number, autoStart: boolean) => Promise<void>)
		| undefined;
	// the seed the active run started with — persisted so a run is replayable
	let currentSeed = 0;
	// one-shot guard: persist a run exactly once per gameover, reset on restart
	let saved = false;
	const [hud, setHud] = createSignal<GameState | null>(null);
	const [ready, setReady] = createSignal(false);
	const bestRun = useBestRun();

	const params = new URLSearchParams(window.location.search);
	// a malformed ?seed (e.g. "abc") must not poison the sim with NaN; fall back
	// to a time-based seed (Date.now is fine here — shell code, not the sim)
	const raw = params.get("seed");
	const parsed = raw === null ? Number.NaN : Number(raw);
	// an explicit ?seed pins every run (incl. restarts) for reproducibility;
	// otherwise each run gets a fresh random seed
	const fixedSeed = Number.isFinite(parsed) ? parsed : null;
	const testMode = params.get("testMode") === "1";

	// gate typing into the sim until the player starts; testMode auto-starts so
	// deterministic probes (window.__game) keep working without a keypress
	const [started, setStarted] = createSignal(testMode);
	const [newBest, setNewBest] = createSignal(false);

	function nextSeed(): number {
		return fixedSeed ?? Date.now() % 2 ** 31;
	}

	// persist the run once when the sim transitions to gameover; capture NEW BEST
	// against the prior best read straight from the DB (the reactive bestRun()
	// signal can still be stale at the gameover instant).
	async function persistRun(state: GameState) {
		const stats = deriveRunStats(state);
		// prior best, read before this run is added
		const prev = await getBestRun();
		setNewBest(prev === undefined || stats.score > prev.score);
		await saveGameRun({
			...stats,
			seed: currentSeed,
			timestamp: Date.now(),
		});
	}
	createEffect(() => {
		const state = hud();
		if (state?.status === "gameover" && !saved) {
			// set the guard synchronously so the effect re-running (hud() churns
			// every frame) can never kick off a second save before the first awaits
			saved = true;
			void persistRun(state);
		}
	});

	onMount(async () => {
		const { startGameLoop } = await import("@/lib/game/render/loop");
		startLoop = async (seed: number, autoStart: boolean) => {
			if (disposed || !canvasRef) return;
			currentSeed = seed;
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
			// real sessions begin paused behind the start overlay; the sim only
			// advances once the player commits (first keypress, or an explicit
			// restart). testMode always runs so deterministic probes work untouched.
			loop.setRunning(autoStart);
			if (testMode) {
				const activeLoop = loop;
				window.__game = {
					getState: () => activeLoop.getState(),
					sendKeys: (keys) => {
						for (const k of keys) activeLoop.pushKey(k);
					},
					sendBackspace: () => activeLoop.pushBackspace(),
					stepTicks: (n) => activeLoop.stepTicks(n),
					renderReady: () => activeLoop.renderReady(),
				};
			}
			setReady(true);
		};
		// testMode auto-runs (probes need a live sim); real sessions wait for input
		await startLoop(nextSeed(), testMode);
	});

	function restart() {
		loop?.dispose();
		loop = undefined;
		saved = false;
		setNewBest(false);
		setHud(null);
		setReady(false);
		setStarted(true);
		// an explicit restart means the player intends to play — run immediately
		void startLoop?.(nextSeed(), true);
	}

	onCleanup(() => {
		disposed = true;
		loop?.dispose();
		if (testMode) window.__game = undefined;
	});

	function onKeyDown(e: KeyboardEvent) {
		// Backspace releases the current lock. Always preventDefault so the browser
		// never navigates back out of the game; only feed the sim a release event
		// during live play (inert on the start overlay and the death screen).
		if (e.key === "Backspace") {
			e.preventDefault();
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (hud()?.status === "gameover" || !started()) return;
			loop?.pushBackspace();
			return;
		}
		if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
		// death screen: R restarts, everything else is inert
		if (hud()?.status === "gameover") {
			if (e.key === "r" || e.key === "R") {
				e.preventDefault();
				restart();
			}
			return;
		}
		// stop the browser acting on gameplay keys (space scroll, quick-find, …)
		e.preventDefault();
		// first keypress dismisses the start screen and resumes the sim, but is
		// itself swallowed — it must not feed a keystroke into the run
		if (!started()) {
			setStarted(true);
			loop?.setRunning(true);
			return;
		}
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
									class="w-28 rounded bg-white/10 px-2 py-1 transition-shadow"
									classList={{
										"shadow-[0_0_14px_rgba(251,191,36,0.75)] bg-amber-400/15":
											comboMultiplier(state().combo) >= 2,
									}}
								>
									<div class="flex justify-between">
										<span>combo {state().combo}</span>
										<span
											class="text-amber-300"
											classList={{
												"font-bold drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]":
													comboMultiplier(state().combo) >= 2,
											}}
										>
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
			<Show when={ready() && !started() && hud()?.status !== "gameover"}>
				<StartScreen bestRun={bestRun()} />
			</Show>
			<Show when={hud()?.status === "gameover" ? hud() : null}>
				{(state) => (
					<DeathScreen
						stats={deriveRunStats(state())}
						isNewBest={newBest()}
						onRestart={restart}
					/>
				)}
			</Show>
		</div>
	);
}
