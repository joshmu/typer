import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { themeNames, themes } from "@/lib/themes";
import ThemePicker from "./ThemePicker";

function setup(current = "lamplight") {
	const onSelect = vi.fn();
	const onPreview = vi.fn();
	const result = render(() => (
		<ThemePicker
			currentTheme={current}
			onSelect={onSelect}
			onPreview={onPreview}
		/>
	));
	return { ...result, onSelect, onPreview };
}

describe("ThemePicker", () => {
	it("shows one tile per theme, Lamplight first, named by its label", () => {
		setup();
		const tiles = screen.getAllByRole("button");
		expect(tiles).toHaveLength(themeNames.length);
		expect(tiles[0]).toHaveAccessibleName("Lamplight");
		expect(screen.getByRole("button", { name: "Dracula" })).toBeTruthy();
	});

	it("paints each tile in its own theme colours", () => {
		setup();
		const tile = screen.getByRole("button", { name: "Nord" });
		expect(tile.style.getPropertyValue("--t-bg")).toBe(themes.nord.bg);
		expect(tile.style.getPropertyValue("--t-caret")).toBe(themes.nord.caret);
	});

	it("marks the current theme as pressed", () => {
		setup("dracula");
		expect(
			screen
				.getByRole("button", { name: "Dracula" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.getByRole("button", { name: "Nord" }).getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("previews a theme on hover and reverts when the pointer leaves", () => {
		const { onPreview, container } = setup();
		fireEvent.pointerEnter(screen.getByRole("button", { name: "Nord" }));
		expect(onPreview).toHaveBeenLastCalledWith("nord");
		fireEvent.pointerLeave(
			container.querySelector("[data-theme-grid]") as Element,
		);
		expect(onPreview).toHaveBeenLastCalledWith(null);
	});

	it("previews on keyboard focus and reverts when focus leaves the grid", () => {
		const { onPreview } = setup();
		const nord = screen.getByRole("button", { name: "Nord" });
		fireEvent.focusIn(nord);
		expect(onPreview).toHaveBeenLastCalledWith("nord");
		fireEvent.focusOut(nord, { relatedTarget: document.body });
		expect(onPreview).toHaveBeenLastCalledWith(null);
	});

	it("does not revert while focus moves between tiles", () => {
		const { onPreview } = setup();
		const nord = screen.getByRole("button", { name: "Nord" });
		const dracula = screen.getByRole("button", { name: "Dracula" });
		fireEvent.focusOut(nord, { relatedTarget: dracula });
		expect(onPreview).not.toHaveBeenCalledWith(null);
	});

	it("selects on click", () => {
		const { onSelect } = setup();
		fireEvent.click(screen.getByRole("button", { name: "Rose Pine" }));
		expect(onSelect).toHaveBeenCalledWith("rose-pine");
	});
});
