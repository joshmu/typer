import { createRoot } from "solid-js";
import { reconcile } from "solid-js/store";
import { describe, expect, it } from "vitest";
import {
	createPreferences,
	defaultPreferences,
	type UserPreferences,
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

	it("has no legacy sound or font family preference", () => {
		expect(defaultPreferences).not.toHaveProperty("soundEnabled");
		expect(defaultPreferences).not.toHaveProperty("fontFamily");
	});

	it("keeps key sound off by default", () =>
		createRoot((dispose) => {
			const [prefs] = createPreferences(createMockStorage());
			expect(prefs.keySound).toBe(false);
			dispose();
		}));

	it("does not turn key sound on from a stored soundEnabled", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			storage.setItem(
				"typer-preferences",
				JSON.stringify({ theme: "dracula", soundEnabled: true }),
			);
			const [prefs] = createPreferences(storage);
			expect(prefs.keySound).toBe(false);
			dispose();
		}));

	it("persists key sound", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [, setPrefs] = createPreferences(storage);
			setPrefs("keySound", true);
			const [reloaded] = createPreferences(storage);
			expect(reloaded.keySound).toBe(true);
			dispose();
		}));

	it("toggles boolean preferences", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [prefs, setPrefs] = createPreferences(storage);

			expect(prefs.smoothCaret).toBe(true);
			setPrefs("smoothCaret", false);
			expect(prefs.smoothCaret).toBe(false);

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
	it("lands on a time 30 test with no stored last mode", () =>
		createRoot((dispose) => {
			const [prefs] = createPreferences(createMockStorage());
			expect(prefs.lastMode).toEqual({ type: "time", seconds: 30 });
			dispose();
		}));

	it("persists the last mode and its sub-option", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [, setPrefs] = createPreferences(storage);
			setPrefs("lastMode", reconcile({ type: "words", count: 50 } as const));
			const [reloaded] = createPreferences(storage);
			expect(reloaded.lastMode).toEqual({ type: "words", count: 50 });
			expect(defaultPreferences.lastMode).toEqual({
				type: "time",
				seconds: 30,
			});
			dispose();
		}));

	it("reads a stored last mode with a missing sub-option as that mode's default", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			storage.setItem(
				"typer-preferences",
				JSON.stringify({ lastMode: { type: "quote" } }),
			);
			const [prefs] = createPreferences(storage);
			expect(prefs.lastMode).toEqual({ type: "quote", length: "medium" });
			dispose();
		}));

	it("shows the small-screen notice until it is dismissed", () =>
		createRoot((dispose) => {
			const storage = createMockStorage();
			const [prefs, setPrefs] = createPreferences(storage);
			expect(prefs.smallScreenNoticeDismissed).toBe(false);
			setPrefs("smallScreenNoticeDismissed", true);
			const [reloaded] = createPreferences(storage);
			expect(reloaded.smallScreenNoticeDismissed).toBe(true);
			dispose();
		}));
});
