import { describe, expect, it, vi } from "vitest";
import {
	backoffDelay,
	fetchWithRetry,
	isRetryableStatus,
	parseRetryAfter,
} from "./http-retry";

describe("isRetryableStatus", () => {
	it("retries rate limits and server errors", () => {
		for (const status of [429, 500, 502, 503, 504, 599]) {
			expect(isRetryableStatus(status)).toBe(true);
		}
	});

	it("fails fast on other client errors", () => {
		for (const status of [400, 401, 403, 404, 410, 418]) {
			expect(isRetryableStatus(status)).toBe(false);
		}
	});
});

describe("parseRetryAfter", () => {
	const now = Date.parse("2026-10-05T10:00:00Z");

	it("reads delta seconds", () => {
		expect(parseRetryAfter("2", now)).toBe(2000);
		expect(parseRetryAfter("0", now)).toBe(0);
	});

	it("reads an HTTP date", () => {
		expect(parseRetryAfter("Mon, 05 Oct 2026 10:00:03 GMT", now)).toBe(3000);
	});

	it("treats a past date as no wait", () => {
		expect(parseRetryAfter("Mon, 05 Oct 2026 09:59:00 GMT", now)).toBe(0);
	});

	it("ignores missing or malformed values", () => {
		expect(parseRetryAfter(null, now)).toBeNull();
		expect(parseRetryAfter("soon", now)).toBeNull();
		expect(parseRetryAfter("-4", now)).toBeNull();
	});
});

describe("backoffDelay", () => {
	it("doubles per attempt and jitters within the upper half", () => {
		expect(backoffDelay(0, () => 0)).toBe(150);
		expect(backoffDelay(0, () => 1)).toBe(300);
		expect(backoffDelay(1, () => 0)).toBe(300);
		expect(backoffDelay(1, () => 1)).toBe(600);
	});
});

function respond(status: number, headers?: HeadersInit): Response {
	return new Response(status === 200 ? "ok" : "err", { status, headers });
}

function setup(...outcomes: (Response | Error | DOMException)[]) {
	const fetchImpl = vi.fn(async () => {
		const next = outcomes.shift();
		if (!next) throw new Error("no more outcomes");
		if (!(next instanceof Response)) throw next;
		return next;
	});
	const sleep = vi.fn(async (_ms: number) => {});
	return { fetchImpl, sleep, random: () => 0.5 };
}

describe("fetchWithRetry", () => {
	it("returns the first good response without waiting", async () => {
		const deps = setup(respond(200));
		const res = await fetchWithRetry("/x", deps);
		expect(res.status).toBe(200);
		expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
		expect(deps.sleep).not.toHaveBeenCalled();
	});

	it("retries a 503 then succeeds, backing off between attempts", async () => {
		const deps = setup(respond(503), respond(502), respond(200));
		const res = await fetchWithRetry("/x", deps);
		expect(res.status).toBe(200);
		expect(deps.fetchImpl).toHaveBeenCalledTimes(3);
		expect(deps.sleep.mock.calls.map(([ms]) => ms)).toEqual([225, 450]);
	});

	it("retries a network error", async () => {
		const deps = setup(new TypeError("Failed to fetch"), respond(200));
		expect((await fetchWithRetry("/x", deps)).status).toBe(200);
		expect(deps.fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("gives up after two retries with the last response", async () => {
		const deps = setup(respond(500), respond(500), respond(503));
		const res = await fetchWithRetry("/x", deps);
		expect(res.status).toBe(503);
		expect(deps.fetchImpl).toHaveBeenCalledTimes(3);
	});

	it("rethrows the last network error once retries run out", async () => {
		const deps = setup(
			new TypeError("a"),
			new TypeError("b"),
			new TypeError("c"),
		);
		await expect(fetchWithRetry("/x", deps)).rejects.toThrow("c");
	});

	it("does not retry a 404", async () => {
		const deps = setup(respond(404));
		expect((await fetchWithRetry("/x", deps)).status).toBe(404);
		expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("waits as long as Retry-After asks when that is longer", async () => {
		const deps = setup(respond(429, { "Retry-After": "2" }), respond(200));
		await fetchWithRetry("/x", deps);
		expect(deps.sleep).toHaveBeenCalledWith(2000, undefined);
	});

	it("gives up when Retry-After asks for longer than the cap", async () => {
		const deps = setup(respond(429, { "Retry-After": "120" }), respond(200));
		const res = await fetchWithRetry("/x", deps);
		expect(res.status).toBe(429);
		expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("gives up when Retry-After would outlast the caller's deadline", async () => {
		const deps = setup(respond(429, { "Retry-After": "3" }), respond(200));
		const res = await fetchWithRetry("/x", {
			...deps,
			now: () => 1000,
			deadline: 3000,
		});
		expect(res.status).toBe(429);
		expect(deps.sleep).not.toHaveBeenCalled();
	});

	it("waits for Retry-After when the deadline allows it", async () => {
		const deps = setup(respond(503, { "Retry-After": "1" }), respond(200));
		const res = await fetchWithRetry("/x", {
			...deps,
			now: () => 1000,
			deadline: 9000,
		});
		expect(res.status).toBe(200);
		expect(deps.sleep).toHaveBeenCalledWith(1000, undefined);
	});

	it("never retries once the caller has aborted", async () => {
		const controller = new AbortController();
		const abort = new DOMException("aborted", "AbortError");
		const deps = setup(abort, respond(200));
		controller.abort();
		await expect(
			fetchWithRetry("/x", { ...deps, signal: controller.signal }),
		).rejects.toBe(abort);
		expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
	});
});
