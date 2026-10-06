import { describe, expect, it, vi } from "vitest";
import { createBookStarter } from "./book-start";

function deferred() {
	let resolve!: () => void;
	let reject!: (err: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("createBookStarter", () => {
	it("opens a book once it has loaded", async () => {
		const open = vi.fn();
		const starter = createBookStarter(async () => {}, open);
		await starter.start("a/b");
		expect(open).toHaveBeenCalledWith("a/b");
	});

	it("does not open a book that loads after it was cancelled", async () => {
		const load = deferred();
		const open = vi.fn();
		const starter = createBookStarter(() => load.promise, open);
		const started = starter.start("a/b");
		starter.cancel();
		load.resolve();
		await started;
		expect(open).not.toHaveBeenCalled();
	});

	it("opens only the latest of two overlapping starts", async () => {
		const first = deferred();
		const second = deferred();
		const loads = [first, second];
		const open = vi.fn();
		const starter = createBookStarter(() => loads.shift()!.promise, open);
		const a = starter.start("a/a");
		const b = starter.start("b/b");
		second.resolve();
		first.resolve();
		await Promise.all([a, b]);
		expect(open.mock.calls).toEqual([["b/b"]]);
	});

	it("passes a failed load on to the caller", async () => {
		const open = vi.fn();
		const err = new Error("offline");
		const starter = createBookStarter(() => Promise.reject(err), open);
		await expect(starter.start("a/b")).rejects.toBe(err);
		expect(open).not.toHaveBeenCalled();
	});
});
