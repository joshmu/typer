import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";

export interface UserPreferences {
	theme: string;
	soundEnabled: boolean;
	smoothCaret: boolean;
	caretStyle: "line" | "block" | "underline";
	fontSize: number;
	fontFamily: string;
	showLiveWpm: boolean;
}

export const defaultPreferences: UserPreferences = {
	theme: "serika-dark",
	soundEnabled: false,
	smoothCaret: true,
	caretStyle: "line",
	fontSize: 16,
	fontFamily: "monospace",
	showLiveWpm: true,
};

export function createPreferences(storage?: Storage) {
	return makePersisted(createStore<UserPreferences>({ ...defaultPreferences }), {
		name: "typer-preferences",
		...(storage ? { storage } : {}),
	});
}
