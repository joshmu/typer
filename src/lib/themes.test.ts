import { describe, expect, it } from "vitest";
import { type Theme, getTheme, themeNames, themes } from "./themes";

const REQUIRED_KEYS: (keyof Theme)[] = [
	"name",
	"label",
	"bg",
	"bgSecondary",
	"text",
	"textSub",
	"primary",
	"error",
	"errorExtra",
	"caret",
	"correct",
];

describe("themes", () => {
	it("has at least 10 built-in themes", () => {
		expect(themeNames.length).toBeGreaterThanOrEqual(10);
	});

	it("every theme has all required keys", () => {
		for (const name of themeNames) {
			const theme = themes[name];
			for (const key of REQUIRED_KEYS) {
				expect(theme[key], `${name} missing ${key}`).toBeDefined();
			}
		}
	});

	it("every color value is a valid hex color", () => {
		const colorKeys = REQUIRED_KEYS.filter(
			(k) => k !== "name" && k !== "label",
		);
		for (const name of themeNames) {
			const theme = themes[name];
			for (const key of colorKeys) {
				const value = theme[key as keyof Theme] as string;
				expect(value, `${name}.${key} = ${value}`).toMatch(/^#[0-9a-fA-F]{6}$/);
			}
		}
	});

	it("getTheme returns the correct theme", () => {
		const theme = getTheme("serika-dark");
		expect(theme.label).toBe("Serika Dark");
	});

	it("getTheme returns default for unknown name", () => {
		const theme = getTheme("nonexistent");
		expect(theme.name).toBe("serika-dark");
	});

	it("includes serika-dark as default theme", () => {
		expect(themeNames).toContain("serika-dark");
	});
});
