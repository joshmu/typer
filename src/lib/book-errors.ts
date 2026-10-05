import {
	BookNotFoundError,
	BookServiceError,
	NetworkError,
} from "./core/types/errors";

export interface BookErrorCopy {
	title: string;
	body: string;
	/** Trying again could help. */
	retryable: boolean;
}

function browserOnline(): boolean {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** User-facing words for a failed catalogue or book load. */
export function describeBookError(
	err: unknown,
	online = browserOnline(),
): BookErrorCopy {
	if (err instanceof BookNotFoundError) {
		return {
			title: "This book isn't available",
			body: "Standard Ebooks no longer lists it. Pick another from the library.",
			retryable: false,
		};
	}
	if (!online) {
		return {
			title: "You're offline",
			body: "Reconnect, then try again.",
			retryable: true,
		};
	}
	if (err instanceof NetworkError) {
		return err.timedOut
			? {
					title: "Standard Ebooks is taking too long",
					body: "It didn't answer in time. Try again in a moment.",
					retryable: true,
				}
			: {
					title: "Couldn't reach Standard Ebooks",
					body: "Check your connection, then try again.",
					retryable: true,
				};
	}
	if (err instanceof BookServiceError) {
		if (err.status === 429) {
			return {
				title: "Standard Ebooks is busy",
				body: "Too many requests right now. Try again in a minute.",
				retryable: true,
			};
		}
		if (err.status >= 500) {
			return {
				title: "Standard Ebooks is having trouble",
				body: `Its server answered with an error (${err.status}). Try again shortly.`,
				retryable: true,
			};
		}
		if (err.status === 0) {
			return {
				title: "This book wouldn't open",
				body: "Its chapter list didn't load. Try again.",
				retryable: true,
			};
		}
	}
	return {
		title: "Something went wrong",
		body: "That didn't load. Try again.",
		retryable: true,
	};
}
