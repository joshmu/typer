import { createRunSession, type RunSession } from "../session/run-session";
import type { GameState } from "../sim/state";
import { createBabylonRenderer } from "./babylon-renderer";

export type GameLoopOptions = {
	canvas: HTMLCanvasElement;
	seed: number;
	testMode: boolean;
	onState(state: GameState): void;
};

export type GameLoop = RunSession;

/** A run session drawn by Babylon: real time on the render loop, or input-stepped in testMode. */
export function startGameLoop(opts: GameLoopOptions): GameLoop {
	const renderer = createBabylonRenderer(opts.canvas, {
		preserveDrawingBuffer: opts.testMode,
	});
	const session = createRunSession({
		seed: opts.seed,
		renderer,
		now: () => performance.now(),
		stepOnInput: opts.testMode,
		onState: opts.onState,
	});
	// testMode: a single deterministic frame; probes drive it via window.__game
	if (opts.testMode) session.draw();
	else renderer.runRenderLoop(session.frame);
	return session;
}
