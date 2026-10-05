import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";
import type { StopOnError, TestMode } from "@/lib/core/types";
import { DEFAULT_MODE, sanitizeMode } from "@/lib/last-mode";

export interface UserPreferences {
	theme: string;
	smoothCaret: boolean;
	caretStyle: "line" | "block" | "underline";
	fontSize: number;
	showLiveWpm: boolean;
	stopOnError: StopOnError;
	wordListSize: "200" | "1k" | "5k";
	keySound: boolean;
	/** The mode a visit to "/" restores. Set it with reconcile: a plain set merges. */
	lastMode: TestMode;
	smallScreenNoticeDismissed: boolean;
}

export const defaultPreferences: UserPreferences = {
	theme: "serika-dark",
	smoothCaret: true,
	caretStyle: "line",
	fontSize: 16,
	showLiveWpm: true,
	stopOnError: "letter",
	wordListSize: "200",
	keySound: false,
	lastMode: DEFAULT_MODE,
	smallScreenNoticeDismissed: false,
};

/** Typing text size in px for a stored font size (16 renders at 24px). */
export function typingFontSize(fontSize: number): number {
	return fontSize * 1.5;
}

export function createPreferences(storage?: Storage) {
	return makePersisted(
		createStore<UserPreferences>({
			...defaultPreferences,
			lastMode: { ...defaultPreferences.lastMode },
		}),
		{
			name: "typer-preferences",
			...(storage ? { storage } : {}),
			deserialize: (raw: string): UserPreferences => {
				const stored = JSON.parse(raw) as Partial<UserPreferences>;
				return {
					...defaultPreferences,
					...stored,
					lastMode: sanitizeMode(stored.lastMode),
				};
			},
		},
	);
}
