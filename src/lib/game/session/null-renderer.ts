import type { SimEvent } from "../sim/events";
import type { RunRenderer } from "./run-session";

/** A renderer that draws nothing and records what it was handed, for headless runs. */
export type NullRenderer = RunRenderer & {
	frames: number;
	lastEvents: SimEvent[];
	disposed: boolean;
};

export function createNullRenderer(): NullRenderer {
	const r: NullRenderer = {
		frames: 0,
		lastEvents: [],
		disposed: false,
		draw(_state, events) {
			r.frames += 1;
			r.lastEvents = [...events];
		},
		isReady: () => true,
		dispose() {
			r.disposed = true;
		},
	};
	return r;
}
