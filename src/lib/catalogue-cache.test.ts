import { beforeEach, describe, expect, it } from "vitest";
import {
	CATALOGUE_KEY,
	readSavedCatalogue,
	saveCatalogue,
} from "./catalogue-cache";
import type { BookMeta } from "./core/types/book";

function book(id: string): BookMeta {
	return {
		id,
		title: `Title ${id}`,
		author: "Author",
		description: "",
		language: "en",
		wordCount: 0,
		coverUrl: `https://standardebooks.org/images/covers/${id}.jpg`,
		coverHeroUrl: "",
		chapters: [],
		datePublished: "",
		dateModified: "",
	};
}

describe("catalogue cache", () => {
	beforeEach(() => localStorage.clear());

	it("reads back what it saved, with the save time", () => {
		saveCatalogue([book("a/one"), book("b/two")], 1234);
		expect(readSavedCatalogue()).toEqual({
			books: [book("a/one"), book("b/two")],
			savedAt: 1234,
		});
	});

	it("has nothing before the first save", () => {
		expect(readSavedCatalogue()).toBeNull();
	});

	it("never saves an empty catalogue over a good one", () => {
		saveCatalogue([book("a/one")], 1);
		saveCatalogue([], 2);
		expect(readSavedCatalogue()?.books).toEqual([book("a/one")]);
	});

	it("ignores a corrupt or foreign entry", () => {
		localStorage.setItem(CATALOGUE_KEY, "{not json");
		expect(readSavedCatalogue()).toBeNull();
		localStorage.setItem(CATALOGUE_KEY, JSON.stringify({ books: [{}] }));
		expect(readSavedCatalogue()).toBeNull();
		localStorage.setItem(CATALOGUE_KEY, JSON.stringify({ savedAt: 1 }));
		expect(readSavedCatalogue()).toBeNull();
	});

	it("survives storage that throws", () => {
		const broken = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("quota");
			},
		} as unknown as Storage;
		expect(() => saveCatalogue([book("a/one")], 1, broken)).not.toThrow();
		expect(readSavedCatalogue(broken)).toBeNull();
	});
});
