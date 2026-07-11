import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { GameLoop } from "@/lib/game/render/loop";
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
					<div class="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 gap-6 font-mono text-sm">
						<span data-testid="game-score">score {state().score}</span>
						<span data-testid="game-hp">hp {state().playerHp}</span>
						<span data-testid="game-kills">kills {state().kills}</span>
					</div>
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
