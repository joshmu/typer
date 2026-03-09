import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";
import type { StopOnError } from "@/lib/core/types";

export interface UserPreferences {
	theme: string;
	soundEnabled: boolean;
	smoothCaret: boolean;
	caretStyle: "line" | "block" | "underline";
	fontSize: number;
	fontFamily: string;
	showLiveWpm: boolean;
	stopOnError: StopOnError;
	wordListSize: "200" | "1k" | "5k";
}

export const defaultPreferences: UserPreferences = {
	theme: "serika-dark",
	soundEnabled: false,
	smoothCaret: true,
	caretStyle: "line",
	fontSize: 16,
	fontFamily: "monospace",
	showLiveWpm: true,
	stopOnError: "letter",
	wordListSize: "200",
};

export function createPreferences(storage?: Storage) {
	return makePersisted(createStore<UserPreferences>({ ...defaultPreferences }), {
		name: "typer-preferences",
		...(storage ? { storage } : {}),
		deserialize: (raw: string): UserPreferences => {
			const stored = JSON.parse(raw) as Partial<UserPreferences>;
			return { ...defaultPreferences, ...stored };
		},
	});
}
