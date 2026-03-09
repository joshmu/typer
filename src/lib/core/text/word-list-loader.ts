import { top200 } from "./words";

export type WordListSize = "200" | "1k" | "5k";

const cache: Map<WordListSize, string[]> = new Map();

export async function loadWordList(size: WordListSize): Promise<string[]> {
	if (cache.has(size)) return cache.get(size)!;

	let list: string[];
	if (size === "200") {
		list = top200;
	} else if (size === "1k") {
		list = (await import("./data/english-1k.json")).default;
	} else {
		list = (await import("./data/english-5k.json")).default;
	}

	cache.set(size, list);
	return list;
}
