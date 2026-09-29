import { render } from "@solidjs/testing-library";
import type { SetStoreFunction } from "solid-js/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UserPreferences } from "./preferences";
import { PreferencesProvider, usePreferences } from "./preferences-context";
import { themes } from "./themes";

function renderProvider() {
	let setPrefs!: SetStoreFunction<UserPreferences>;
	function Capture() {
		[, setPrefs] = usePreferences();
		return null;
	}
	render(() => (
		<PreferencesProvider>
			<Capture />
		</PreferencesProvider>
	));
	return setPrefs;
}

const root = () => document.documentElement;

describe("PreferencesProvider", () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => {
		root().removeAttribute("data-theme");
		root().removeAttribute("style");
	});

	it("applies the stored theme", () => {
		localStorage.setItem(
			"typer-preferences",
			JSON.stringify({ theme: "dracula" }),
		);
		renderProvider();
		expect(root().getAttribute("data-theme")).toBe("dracula");
		expect(root().style.getPropertyValue("--bg")).toBe(themes.dracula.bg);
	});

	it("applies the theme when the preference changes", () => {
		const setPrefs = renderProvider();
		setPrefs("theme", "dracula");
		expect(root().getAttribute("data-theme")).toBe("dracula");
		expect(root().style.getPropertyValue("--primary")).toBe(
			themes.dracula.primary,
		);
	});

	it("sets the typing font size variable and updates it", () => {
		const setPrefs = renderProvider();
		expect(root().style.getPropertyValue("--typing-font-size")).toBe("24px");
		setPrefs("fontSize", 20);
		expect(root().style.getPropertyValue("--typing-font-size")).toBe("30px");
	});

	it("loads stored preferences that carry removed keys", () => {
		localStorage.setItem(
			"typer-preferences",
			JSON.stringify({
				theme: "dracula",
				soundEnabled: true,
				fontFamily: "monospace",
				fontSize: 18,
			}),
		);
		renderProvider();
		expect(root().getAttribute("data-theme")).toBe("dracula");
		expect(root().style.getPropertyValue("--typing-font-size")).toBe("27px");
	});
});
