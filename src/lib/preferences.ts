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
}

export const defaultPreferences: UserPreferences = {
	theme: "serika-dark",
	soundEnabled: false,
	smoothCaret: true,
	caretStyle: "line",
	fontSize: 16,
	fontFamily: "monospace",
	showLiveWpm: true,
	stopOnError: "off",
};

export function createPreferences(storage?: Storage) {
	return makePersisted(createStore<UserPreferences>({ ...defaultPreferences }), {
		name: "typer-preferences",
		...(storage ? { storage } : {}),
	});
}
