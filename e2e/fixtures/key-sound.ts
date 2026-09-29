import type { Page } from "@playwright/test";

declare global {
	interface Window {
		__keySound?: { contexts: AudioContext[]; clicks: number[] };
	}
}

/** Tag for tests that run in the chromium-sound project. */
export const SOUND_TAG = "@sound";

/**
 * Records every AudioContext the page creates and the duration of every
 * buffer it starts. With `on`, stores the key sound preference as enabled.
 */
export async function watchKeySound(page: Page, on: boolean) {
	await page.addInitScript((enable) => {
		if (enable) {
			localStorage.setItem(
				"typer-preferences",
				JSON.stringify({ keySound: true }),
			);
		}
		const record = { contexts: [] as AudioContext[], clicks: [] as number[] };
		window.__keySound = record;
		const Base = window.AudioContext;
		window.AudioContext = class extends Base {
			constructor(options?: AudioContextOptions) {
				super(options);
				record.contexts.push(this);
			}
		};
		const start = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (
			this: AudioBufferSourceNode,
			...args: Parameters<AudioBufferSourceNode["start"]>
		) {
			record.clicks.push(this.buffer?.duration ?? 0);
			return start.apply(this, args);
		};
	}, on);
}

export function keySoundRecord(page: Page) {
	return page.evaluate(() => ({
		contexts: window.__keySound?.contexts.length ?? 0,
		states: window.__keySound?.contexts.map((c) => c.state) ?? [],
		clicks: window.__keySound?.clicks ?? [],
	}));
}
