// Top 200 common English words for typing practice
// Source: Monkeytype (MIT licensed) + curated
export const top200 = [
	"the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
	"it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
	"this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
	"or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
	"so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
	"when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
	"people", "into", "year", "your", "good", "some", "could", "them", "see",
	"other", "than", "then", "now", "look", "only", "come", "its", "over",
	"think", "also", "back", "after", "use", "two", "how", "our", "work",
	"first", "well", "way", "even", "new", "want", "because", "any", "these",
	"give", "day", "most", "us", "great", "between", "need", "large", "under",
	"never", "each", "same", "much", "big", "such", "again", "place", "around",
	"help", "every", "near", "plant", "city", "tree", "home", "try", "own",
	"turn", "move", "live", "found", "long", "very", "open", "put", "thing",
	"right", "too", "still", "old", "might", "tell", "did", "before", "last",
	"find", "here", "many", "small", "end", "those", "high", "head", "real",
	"land", "while", "world", "next", "keep", "hand", "kind", "start", "show",
	"group", "side", "part", "set", "made", "three", "left", "life", "must",
	"should", "call", "name", "point", "change", "house", "play", "number",
	"read", "run", "close", "ask", "learn", "let", "door", "line", "being",
];

export function zipfWeightedIndex(length: number): number {
	return Math.floor(length * (Math.random() ** 1.5));
}

export function generateWords(
	count: number,
	options?: {
		punctuation?: boolean;
		numbers?: boolean;
		wordList?: string[];
	},
): string {
	const { punctuation = false, numbers = false, wordList } = options ?? {};
	const source = wordList ?? top200;
	const useZipf = source.length > 200;
	const words: string[] = [];
	let lastWord = "";

	for (let i = 0; i < count; i++) {
		let word: string;
		// No immediate repetition
		do {
			const idx = useZipf
				? zipfWeightedIndex(source.length)
				: Math.floor(Math.random() * source.length);
			word = source[idx];
		} while (word === lastWord);
		lastWord = word;

		if (numbers && Math.random() < 0.1) {
			word = String(Math.floor(Math.random() * 1000));
		}

		if (punctuation) {
			if (Math.random() < 0.1) word = `${word},`;
			else if (Math.random() < 0.05) word = `${word}.`;
			else if (Math.random() < 0.03) word = `${word}?`;

			if (i === 0 || words[i - 1]?.endsWith(".")) {
				word = word.charAt(0).toUpperCase() + word.slice(1);
			}
		}

		words.push(word);
	}

	return words.join(" ");
}

export function truncateToWordCount(text: string, count: number): string {
	return text.split(/\s+/).slice(0, count).join(" ");
}
