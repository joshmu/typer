import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { themeBootScript } from "./theme-boot";
import { applyTheme, THEME_CSS_VARS, themeNames, themes } from "./themes";

const root = () => document.documentElement;

function runBoot() {
	// The script runs as an inline <script> before the app bundle.
	new Function(themeBootScript())();
}

function snapshot(): Record<string, string> {
	const out: Record<string, string> = {
		"data-theme": root().getAttribute("data-theme") ?? "",
	};
	for (const [, cssVar] of THEME_CSS_VARS) {
		out[cssVar] = root().style.getPropertyValue(cssVar);
	}
	return out;
}

function reset() {
	localStorage.clear();
	root().removeAttribute("data-theme");
	root().removeAttribute("style");
}

describe("theme boot script", () => {
	beforeEach(reset);
	afterEach(reset);

	it("paints exactly what applyTheme paints, for every theme", () => {
		for (const name of themeNames) {
			reset();
			applyTheme(themes[name]);
			const expected = snapshot();

			reset();
			localStorage.setItem(
				"typer-preferences",
				JSON.stringify({ theme: name }),
			);
			runBoot();
			expect(snapshot(), name).toEqual(expected);
		}
	});

	it("leaves the CSS default alone with no stored theme", () => {
		runBoot();
		expect(root().hasAttribute("data-theme")).toBe(false);
		expect(root().getAttribute("style")).toBeNull();
	});

	it("ignores an unknown theme", () => {
		localStorage.setItem(
			"typer-preferences",
			JSON.stringify({ theme: "nope" }),
		);
		runBoot();
		expect(root().hasAttribute("data-theme")).toBe(false);
	});

	it("ignores inherited object keys", () => {
		localStorage.setItem(
			"typer-preferences",
			JSON.stringify({ theme: "constructor" }),
		);
		runBoot();
		expect(root().hasAttribute("data-theme")).toBe(false);
	});

	it("never throws on corrupt storage", () => {
		localStorage.setItem("typer-preferences", "{not json");
		expect(runBoot).not.toThrow();
	});

	it("covers every colour key on the Theme", () => {
		const colourKeys = Object.keys(themes.lamplight).filter(
			(k) => k !== "name" && k !== "label",
		);
		expect(THEME_CSS_VARS.map(([key]) => key).sort()).toEqual(
			colourKeys.sort(),
		);
	});
});
