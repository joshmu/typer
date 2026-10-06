export interface BookStarter {
	/** Loads the book, then opens it unless cancelled or superseded meanwhile. */
	start(bookId: string): Promise<void>;
	/** Drops any start still loading, so it never opens its book. */
	cancel(): void;
}

/** Book starts where only the latest one still wanted opens its book. */
export function createBookStarter(
	load: (bookId: string) => Promise<unknown>,
	open: (bookId: string) => void,
): BookStarter {
	let latest = 0;
	return {
		async start(bookId) {
			const token = ++latest;
			await load(bookId);
			if (token === latest) open(bookId);
		},
		cancel() {
			latest++;
		},
	};
}
