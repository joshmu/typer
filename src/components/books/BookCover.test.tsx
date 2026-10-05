import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import BookCover from "./BookCover";

describe("BookCover", () => {
	it("falls back to a title-on-colour cover when the image fails", () => {
		const { container } = render(() => (
			<BookCover
				bookId="a/b"
				title="Middlemarch"
				author="George Eliot"
				src="https://example.test/missing.jpg"
			/>
		));
		const img = container.querySelector("img");
		expect(img).not.toBeNull();

		fireEvent.error(img as HTMLImageElement);

		expect(screen.getByTestId("cover-fallback").textContent).toContain(
			"Middlemarch",
		);
		expect(container.querySelector("img")).toBeNull();
	});

	it("uses the fallback when there is no cover URL", () => {
		render(() => (
			<BookCover bookId="a/b" title="Cranford" author="Gaskell" src="" />
		));

		expect(screen.getByTestId("cover-fallback").textContent).toContain(
			"Cranford",
		);
	});
});
