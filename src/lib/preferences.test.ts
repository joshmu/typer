import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import {
	type UserPreferences,
	createPreferences,
	defaultPreferences,
} from "./preferences";

function createMockStorage(): Storage {
	let data: Record<string, string> = {};
	return {
		getItem: (key: string) => data[key] ?? null,
		setItem: (key: string, value: string) => {
			data[key] = value;
		},
		removeItem: (key: string) => {
			delete data[key];
		},
		clear: () => {
			data = {};
		},
		key: (index: number) => Object.keys(data)[index] ?? null,
		get length() {
			return Object.keys(data).length;
		},
	};
}

describe("preferences", () => {
	it("returns default values initially", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [prefs] = createPreferences(storage);

			expect(prefs.theme).toBe("serika-dark");
			expect(prefs.fontSize).toBe(16);
			expect(prefs.soundEnabled).toBe(false);
			expect(prefs.smoothCaret).toBe(true);
			expect(prefs.caretStyle).toBe("line");
			expect(prefs.showLiveWpm).toBe(true);

			dispose();
		}));

	it("persists changes to storage", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [prefs, setPrefs] = createPreferences(storage);

			setPrefs("fontSize", 20);

			expect(prefs.fontSize).toBe(20);
			const stored = JSON.parse(
				storage.getItem("typer-preferences")!,
			) as UserPreferences;
			expect(stored.fontSize).toBe(20);

			dispose();
		}));

	it("reads existing values from storage", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			storage.setItem(
				"typer-preferences",
				JSON.stringify({ ...defaultPreferences, theme: "monokai" }),
			);

			const [prefs] = createPreferences(storage);
			expect(prefs.theme).toBe("monokai");

			dispose();
		}));

	it("toggles boolean preferences", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [prefs, setPrefs] = createPreferences(storage);

			expect(prefs.soundEnabled).toBe(false);
			setPrefs("soundEnabled", true);
			expect(prefs.soundEnabled).toBe(true);

			dispose();
		}));

	it("preserves unchanged fields when updating one", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [, setPrefs] = createPreferences(storage);

			setPrefs("fontSize", 24);

			const stored = JSON.parse(
				storage.getItem("typer-preferences")!,
			) as UserPreferences;
			expect(stored.theme).toBe("serika-dark");
			expect(stored.smoothCaret).toBe(true);
			expect(stored.fontSize).toBe(24);

			dispose();
		}));

	it("fills missing fields from defaults when loading old preferences", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			// Simulate old preferences saved before stopOnError was added
			const oldPrefs = {
				theme: "dracula",
				soundEnabled: true,
				smoothCaret: false,
				caretStyle: "block",
				fontSize: 18,
				fontFamily: "monospace",
				showLiveWpm: false,
			};
			storage.setItem("typer-preferences", JSON.stringify(oldPrefs));

			const [prefs] = createPreferences(storage);

			// Existing values preserved
			expect(prefs.theme).toBe("dracula");
			expect(prefs.fontSize).toBe(18);
			// Missing field gets default
			expect(prefs.stopOnError).toBe("letter");

			dispose();
		}));
});
