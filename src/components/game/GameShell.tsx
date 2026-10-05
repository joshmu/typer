import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { GameLoop } from "@/lib/game/render/loop";
import { deriveRunStats } from "@/lib/game/sim/run-stats";
import type { GameState } from "@/lib/game/sim/state";
import { arenaInk, vignetteGradient } from "@/lib/game/view";
import { setRunLive } from "@/lib/game-chrome";
import { getBestRun, saveGameRun, useBestRun } from "@/lib/game-runs";
import DeathScreen from "./DeathScreen";
import Hud from "./Hud";
import PerkDraft from "./PerkDraft";
import StartScreen from "./StartScreen";
import { VEIL } from "./veil";

declare global {
	interface Window {
		__game?: {
			getState(): GameState;
			sendKeys(keys: string): void;
			sendBackspace(): void;
			sendPerk(index: number): void;
			stepTicks(n: number): void;
			renderReady(): boolean;
		};
	}
}

// after the core falls, ignore restart keys this long so a word typed in the
// final moment can't skip the ending
const DEATH_INPUT_GRACE_MS = 800;

export default function GameShell() {
	let canvasRef: HTMLCanvasElement | undefined;
	let shellRef: HTMLDivElement | undefined;
	let loop: GameLoop | undefined;
	let disposed = false;
	let startLoop:
		| ((seed: number, autoStart: boolean) => Promise<void>)
		| undefined;
	// the active run's seed, saved with its record; inputs are not logged, so a
	// saved run cannot be replayed
	let currentSeed = 0;
	// one-shot guard: persist a run exactly once per gameover, reset on restart
	let saved = false;
	let gameoverAt = 0;
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
	const [paused, setPaused] = createSignal(false);
	const [newBest, setNewBest] = createSignal(false);
	const [previousBest, setPreviousBest] = createSignal<number | null>(null);

	const isOver = () => hud()?.status === "gameover";
	// a run is live while the sim is advancing under the player's hands: the
	// site header gets out of the way and the arena owns the viewport
	createEffect(() =>
		setRunLive(ready() && started() && !paused() && !isOver()),
	);
	onCleanup(() => setRunLive(false));

	// the arena is always dark, so a light theme's bg/text pair is swapped for
	// everything inside the shell (plates use the same rule, see arenaInk)
	const [ink, setInk] = createSignal<{ plate: string; ink: string } | null>(
		null,
	);
	onMount(() => {
		const css = getComputedStyle(document.documentElement);
		setInk(
			arenaInk(css.getPropertyValue("--bg"), css.getPropertyValue("--text")),
		);
	});

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
		setPreviousBest(prev?.score ?? null);
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
			gameoverAt = performance.now();
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
					sendPerk: (index) => activeLoop.pushPerk(index),
					stepTicks: (n) => activeLoop.stepTicks(n),
					renderReady: () => activeLoop.renderReady(),
				};
			}
			setReady(true);
		};
		// testMode auto-runs (probes need a live sim); real sessions wait for input
		await startLoop(nextSeed(), testMode);
	});

	function start() {
		if (started() || !ready()) return;
		setStarted(true);
		loop?.setRunning(true);
	}

	function setPause(next: boolean) {
		if (!started() || isOver() || paused() === next) return;
		setPaused(next);
		loop?.setRunning(!next);
	}

	function restart() {
		loop?.dispose();
		loop = undefined;
		saved = false;
		setNewBest(false);
		setPreviousBest(null);
		setPaused(false);
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
		if (e.metaKey || e.ctrlKey || e.altKey) {
			// never let the browser navigate back out of the game
			if (e.key === "Backspace") e.preventDefault();
			return;
		}
		// Backspace releases the current lock. Always preventDefault so the browser
		// never navigates back out of the game; only feed the sim a release event
		// during live play (inert on every overlay).
		if (e.key === "Backspace") {
			e.preventDefault();
			if (isOver() || !started() || paused()) return;
			loop?.pushBackspace();
			return;
		}
		// Esc pauses a live run and resumes a paused one
		if (e.key === "Escape") {
			if (started() && !isOver() && hud()?.wavePhase !== "perk-choice") {
				e.preventDefault();
				setPause(!paused());
			}
			return;
		}
		const isStartKey = e.key === "Enter" || e.key.length === 1;
		// death screen: R (or Enter) restarts once the ending has had a moment
		if (isOver()) {
			if (e.key === "r" || e.key === "R" || e.key === "Enter") {
				e.preventDefault();
				if (
					!testMode &&
					performance.now() - gameoverAt < DEATH_INPUT_GRACE_MS
				) {
					return;
				}
				restart();
			}
			return;
		}
		// the first key dismisses the start screen and starts the sim, but is
		// itself swallowed: it must not feed a keystroke into the run
		if (!started()) {
			if (isStartKey) {
				e.preventDefault();
				start();
			}
			return;
		}
		if (paused()) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				setPause(false);
			}
			return;
		}
		if (e.key.length !== 1) return;
		// perk-choice overlay: digits 1/2/3 pick a card; every other key is inert
		// (the sim ignores keys in this phase anyway — swallow them for cleanliness)
		if (hud()?.wavePhase === "perk-choice") {
			e.preventDefault();
			if (e.key === "1" || e.key === "2" || e.key === "3") {
				loop?.pushPerk(Number(e.key) - 1);
			}
			return;
		}
		// stop the browser acting on gameplay keys (space scroll, quick-find, …)
		e.preventDefault();
		loop?.pushKey(e.key);
	}

	// leaving the tab mid-run pauses it rather than letting the horde walk in
	function onVisibility() {
		if (document.hidden) setPause(true);
	}

	onMount(() => {
		window.addEventListener("keydown", onKeyDown);
		document.addEventListener("visibilitychange", onVisibility);
		onCleanup(() => {
			window.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("visibilitychange", onVisibility);
		});
		// The arena has its own lighting; page-level theme atmosphere stays off.
		document.documentElement.dataset.surface = "game";
		onCleanup(() => delete document.documentElement.dataset.surface);
	});

	// live shell size drives the vignette ellipse
	const [shellSize, setShellSize] = createSignal({ w: 0, h: 0 });
	onMount(() => {
		if (!shellRef) return;
		const ro = new ResizeObserver((entries) => {
			const r = entries[0]?.contentRect;
			setShellSize({ w: r?.width ?? 0, h: r?.height ?? 0 });
		});
		ro.observe(shellRef);
		onCleanup(() => ro.disconnect());
	});

	return (
		<div
			ref={shellRef}
			class="relative h-dvh w-full overflow-hidden bg-black text-text"
			style={ink() ? { "--bg": ink()?.plate, "--text": ink()?.ink } : undefined}
			data-testid="game-shell"
		>
			<canvas ref={canvasRef} class="h-full w-full outline-none" />
			{/* frames the arena: clear over the play area, deepening toward the
			    corners where the floor gives way to space. Above the canvas,
			    below every HUD/overlay element. */}
			<div
				data-testid="game-vignette"
				class="pointer-events-none absolute inset-0"
				style={{
					"background-image": vignetteGradient(shellSize().w, shellSize().h),
				}}
			/>
			<Show when={!ready()}>
				<div class="absolute inset-0 grid place-items-center font-display text-sm uppercase tracking-[0.3em] text-text-sub">
					Loading arena…
				</div>
			</Show>
			<Show when={started() && !isOver() ? hud() : null}>
				{(state) => <Hud state={state()} />}
			</Show>

			<Show when={hud()?.wavePhase === "perk-choice" ? hud() : null}>
				{(state) => (
					<PerkDraft
						wave={state().wave}
						offer={state().perkOffer ?? []}
						onPick={(i) => loop?.pushPerk(i)}
					/>
				)}
			</Show>
			<Show when={paused() && !isOver()}>
				<div
					data-testid="game-paused"
					class={`absolute inset-0 z-10 grid place-items-center ${VEIL}`}
				>
					<div class="flex flex-col items-center gap-4 text-center">
						<h2 class="pl-[0.3em] font-display text-5xl font-black uppercase tracking-[0.3em] text-text">
							Paused
						</h2>
						<button
							type="button"
							onClick={() => setPause(false)}
							class="font-display text-sm uppercase tracking-[0.3em] text-text-sub outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
						>
							<kbd class="mr-2 rounded-md border border-text/20 bg-text/10 px-2 py-0.5 text-text">
								Esc
							</kbd>
							resume
						</button>
					</div>
				</div>
			</Show>
			<Show when={ready() && !started() && !isOver()}>
				<StartScreen bestRun={bestRun()} onStart={start} />
			</Show>
			<Show when={isOver() ? hud() : null}>
				{(state) => (
					<DeathScreen
						stats={deriveRunStats(state())}
						isNewBest={newBest()}
						previousBest={previousBest()}
						onRestart={restart}
					/>
				)}
			</Show>
		</div>
	);
}
