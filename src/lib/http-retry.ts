/** Retries after the first attempt. */
export const MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;
/** A Retry-After longer than this is not worth waiting for. */
const MAX_RETRY_AFTER_MS = 5000;

/** Rate limits and server errors are worth another try; other 4xx are not. */
export function isRetryableStatus(status: number): boolean {
	return status === 429 || (status >= 500 && status <= 599);
}

/** Milliseconds a Retry-After header asks for, or null when absent or invalid. */
export function parseRetryAfter(
	value: string | null,
	now = Date.now(),
): number | null {
	if (value === null) return null;
	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
	const date = Date.parse(trimmed);
	if (Number.isNaN(date) || /^-/.test(trimmed)) return null;
	return Math.max(0, date - now);
}

/** Exponential backoff with jitter over the upper half of each window. */
export function backoffDelay(
	attempt: number,
	random: () => number = Math.random,
): number {
	const ceiling = BASE_DELAY_MS * 2 ** attempt;
	return Math.round(ceiling / 2 + (ceiling / 2) * random());
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

export interface RetryOptions {
	signal?: AbortSignal;
	retries?: number;
	fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	random?: () => number;
}

/**
 * Fetch with retries for transient failures: network errors, 429 and 5xx.
 * Returns the last response (good or not) and rethrows the last network
 * error. An aborted signal stops it at once.
 */
export async function fetchWithRetry(
	url: string,
	options: RetryOptions = {},
): Promise<Response> {
	const {
		signal,
		retries = MAX_RETRIES,
		fetchImpl = (u, init) => fetch(u, init),
		sleep = abortableSleep,
		random = Math.random,
	} = options;

	for (let attempt = 0; ; attempt++) {
		const lastAttempt = attempt >= retries;
		let wait: number;
		try {
			const response = await fetchImpl(url, { signal });
			if (lastAttempt || !isRetryableStatus(response.status)) return response;
			const asked = parseRetryAfter(response.headers.get("Retry-After"));
			if (asked !== null && asked > MAX_RETRY_AFTER_MS) return response;
			wait = Math.max(asked ?? 0, backoffDelay(attempt, random));
			// Free the connection; the body of a failed attempt is never read.
			void response.body?.cancel().catch(() => {});
		} catch (err) {
			if (lastAttempt || signal?.aborted) throw err;
			wait = backoffDelay(attempt, random);
		}
		await sleep(wait, signal);
	}
}
