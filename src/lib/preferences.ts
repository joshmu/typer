import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";
import type { StopOnError } from "@/lib/core/types";
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
};

/** Typing text size in px for a stored font size (16 renders at 24px). */
export function typingFontSize(fontSize: number): number {
	return fontSize * 1.5;
}

export function createPreferences(storage?: Storage) {
	return makePersisted(
		createStore<UserPreferences>({ ...defaultPreferences }),
		{
			name: PREFERENCES_KEY,
			...(storage ? { storage } : {}),
			deserialize: (raw: string): UserPreferences => {
				const stored = JSON.parse(raw) as Partial<UserPreferences>;
				return { ...defaultPreferences, ...stored };
			},
		},
	);
}
