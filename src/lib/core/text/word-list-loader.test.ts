import { describe, expect, it } from "vitest";
import { loadWordList } from "./word-list-loader";

describe("loadWordList", () => {
	it("returns the top200 array for size '200'", async () => {
		const list = await loadWordList("200");
		// top200 has 185 words (historical name)
		expect(list.length).toBeGreaterThan(100);
		expect(list.length).toBeLessThanOrEqual(200);
	});

	it("returns 1000 words for size '1k'", async () => {
		const list = await loadWordList("1k");
		expect(list).toHaveLength(1000);
	});

	it("returns 5000 words for size '5k'", async () => {
		const list = await loadWordList("5k");
		expect(list).toHaveLength(5000);
	});
});
