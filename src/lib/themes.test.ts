import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import {
	DEFAULT_THEME,
	getTheme,
	type Theme,
	themeNames,
	themes,
} from "./themes";

const REQUIRED_KEYS: (keyof Theme)[] = [
	"name",
	"label",
	"bg",
	"bgSecondary",
	"text",
	"textSub",
	"textPending",
	"primary",
	"onPrimary",
	"warning",
	"error",
	"errorExtra",
	"caret",
	"correct",
];

/** Theme key to the CSS custom property applyTheme sets. */
const CSS_VARS: [keyof Theme, string][] = [
	["bg", "--bg"],
	["bgSecondary", "--bg-secondary"],
	["text", "--text"],
	["textSub", "--text-sub"],
	["textPending", "--text-pending"],
	["primary", "--primary"],
	["onPrimary", "--on-primary"],
	["warning", "--warning"],
	["error", "--error"],
	["errorExtra", "--error-extra"],
	["caret", "--caret"],
	["correct", "--correct"],
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

	it("getTheme falls back to Lamplight for an unknown name", () => {
		expect(DEFAULT_THEME).toBe("lamplight");
		expect(getTheme("nonexistent").name).toBe("lamplight");
	});

	it("lists Lamplight first and keeps both serika themes", () => {
		expect(themeNames[0]).toBe("lamplight");
		expect(themeNames).toContain("serika-dark");
		expect(themeNames).toContain("serika-light");
	});

	it("every theme's on-primary text reads on its primary (WCAG AA)", () => {
		for (const name of themeNames) {
			const { onPrimary, primary } = themes[name];
			expect(
				contrastRatio(onPrimary, primary),
				`${name}: ${onPrimary} on ${primary}`,
			).toBeGreaterThanOrEqual(4.5);
		}
	});
});

describe("Lamplight contrast", () => {
	const t = themes.lamplight;
	const pairs: [string, string, string, number][] = [
		["text on bg", t.text, t.bg, 7],
		["text on bg-secondary", t.text, t.bgSecondary, 7],
		// small UI text: WCAG AA
		["text-sub on bg", t.textSub, t.bg, 4.5],
		["text-sub on bg-secondary", t.textSub, t.bgSecondary, 4.5],
		// pending typing text is large: AA large, and well under typed text
		["text-pending on bg", t.textPending, t.bg, 3],
		["typed text over pending text", t.correct, t.textPending, 3],
		["primary on bg", t.primary, t.bg, 4.5],
		["primary on bg-secondary", t.primary, t.bgSecondary, 4.5],
		["error on bg", t.error, t.bg, 4.5],
		["warning on bg", t.warning, t.bg, 4.5],
		["caret on bg", t.caret, t.bg, 3],
		["on-primary on primary", t.onPrimary, t.primary, 4.5],
	];
	for (const [label, fg, bg, min] of pairs) {
		it(`${label} is at least ${min}:1`, () => {
			expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
		});
	}
});

describe("first paint", () => {
	const css = readFileSync(
		join(import.meta.dirname, "../styles/app.css"),
		"utf-8",
	);
	const root = css.match(/:root\s*{([^}]*)}/)?.[1] ?? "";

	it("the :root block in app.css is the default theme", () => {
		const theme = getTheme(DEFAULT_THEME);
		for (const [key, cssVar] of CSS_VARS) {
			const value = root.match(
				new RegExp(`${cssVar}:\\s*(#[0-9a-fA-F]{6})`),
			)?.[1];
			expect(value?.toLowerCase(), cssVar).toBe(
				(theme[key] as string).toLowerCase(),
			);
		}
	});
});
