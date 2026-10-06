import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";
import type { StopOnError, TestMode } from "@/lib/core/types";
import { DEFAULT_MODE, sanitizeMode } from "@/lib/last-mode";
import { PREFERENCES_KEY } from "@/lib/theme-boot";
import { DEFAULT_THEME } from "@/lib/themes";

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
	/** The book last picked in the library, typed yet or not. */
	lastBookId: string;
	smallScreenNoticeDismissed: boolean;
}

export const defaultPreferences: UserPreferences = {
	theme: DEFAULT_THEME,
	smoothCaret: true,
	caretStyle: "line",
	fontSize: 16,
	showLiveWpm: true,
	stopOnError: "letter",
	wordListSize: "200",
	keySound: false,
	lastMode: DEFAULT_MODE,
	lastBookId: "",
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
			name: PREFERENCES_KEY,
			...(storage ? { storage } : {}),
			deserialize: (raw: string): UserPreferences => {
				const parsed: unknown = JSON.parse(raw);
				// Anything but a plain object (null, a string, an array) is ignored.
				const stored: Partial<UserPreferences> =
					parsed !== null &&
					typeof parsed === "object" &&
					!Array.isArray(parsed)
						? parsed
						: {};
				return {
					...defaultPreferences,
					...stored,
					lastMode: sanitizeMode(stored.lastMode),
				};
			},
		},
	);
}
