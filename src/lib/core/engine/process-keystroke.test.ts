import { describe, expect, it } from "vitest";
import { createTypingState } from "../types/test-fixtures";
import { applyKeystroke, processKeystroke } from "./process-keystroke";

describe("processKeystroke", () => {
	describe("correct character", () => {
		it("marks character as correct and advances cursor", () => {
			const state = createTypingState("abc");
			const next = processKeystroke(state, "a", 1000);

			expect(next.words[0].characters[0].status).toBe("correct");
			expect(next.words[0].characters[0].typed).toBe("a");
			expect(next.currentCharIndex).toBe(1);
		});

		it("sets startTime on first keystroke", () => {
			const state = createTypingState("abc");
			expect(state.startTime).toBeNull();

			const next = processKeystroke(state, "a", 1000);
			expect(next.startTime).toBe(1000);
		});

		it("does not overwrite startTime on subsequent keystrokes", () => {
			let state = createTypingState("abc");
			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "b", 2000);

			expect(state.startTime).toBe(1000);
		});
	});

	describe("incorrect character", () => {
		it("marks character as incorrect", () => {
			const state = createTypingState("abc");
			const next = processKeystroke(state, "x", 1000);

			expect(next.words[0].characters[0].status).toBe("incorrect");
			expect(next.words[0].characters[0].typed).toBe("x");
			expect(next.currentCharIndex).toBe(1);
		});
	});

	describe("space (word boundary)", () => {
		it("advances to next word on correct space", () => {
			let state = createTypingState("ab cd");
			// Type "ab" then space
			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "b", 1001);
			state = processKeystroke(state, " ", 1002);

			expect(state.currentWordIndex).toBe(1);
			expect(state.currentCharIndex).toBe(0);
			expect(state.words[0].isActive).toBe(false);
			expect(state.words[1].isActive).toBe(true);
		});
	});

	describe("backspace", () => {
		it("resets the previous character to pending", () => {
			let state = createTypingState("abc");
			state = processKeystroke(state, "a", 1000);
			expect(state.currentCharIndex).toBe(1);

			state = processKeystroke(state, "Backspace", 1001);
			expect(state.currentCharIndex).toBe(0);
			expect(state.words[0].characters[0].status).toBe("pending");
			expect(state.words[0].characters[0].typed).toBeNull();
		});

		it("does not go below index 0", () => {
			const state = createTypingState("abc");
			const next = processKeystroke(state, "Backspace", 1000);

			expect(next.currentCharIndex).toBe(0);
			expect(next.currentWordIndex).toBe(0);
		});

		it("goes back to previous word when at start of current word", () => {
			let state = createTypingState("ab cd");
			// Type "ab " to move to word 1
			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "b", 1001);
			state = processKeystroke(state, " ", 1002);

			expect(state.currentWordIndex).toBe(1);
			expect(state.currentCharIndex).toBe(0);

			// Backspace should go back to word 0
			state = processKeystroke(state, "Backspace", 1003);
			expect(state.currentWordIndex).toBe(0);
			expect(state.currentCharIndex).toBe(2);
			expect(state.words[0].isActive).toBe(true);
			expect(state.words[1].isActive).toBe(false);
		});
	});

	describe("test completion", () => {
		it("does not process keystrokes after test is complete", () => {
			let state = createTypingState("ab");
			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "b", 1001);

			expect(state.endTime).toBe(1001);

			// Additional keystrokes should be ignored
			const next = processKeystroke(state, "c", 1002);
			expect(next).toEqual(state);
		});

		it("does not end time mode on the last word", () => {
			let state = createTypingState("ab", {
				mode: { type: "time", seconds: 30 },
			});
			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "b", 1001);

			expect(state.endTime).toBeNull();
			expect(state.currentCharIndex).toBe(2);
		});

		it("sets endTime when last character is typed", () => {
			let state = createTypingState("ab");
			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "b", 1001);

			expect(state.endTime).toBe(1001);
		});
	});

	describe("ignored keys", () => {
		it("ignores modifier keys", () => {
			const state = createTypingState("abc");
			for (const key of ["Shift", "Control", "Alt", "Meta", "CapsLock"]) {
				const next = processKeystroke(state, key, 1000);
				expect(next).toEqual(state);
			}
		});

		it("ignores function keys", () => {
			const state = createTypingState("abc");
			const next = processKeystroke(state, "F1", 1000);
			expect(next).toEqual(state);
		});

		it("ignores Tab and Escape", () => {
			const state = createTypingState("abc");
			for (const key of ["Tab", "Escape"]) {
				const next = processKeystroke(state, key, 1000);
				expect(next).toEqual(state);
			}
		});
	});

	describe("stop on error: letter", () => {
		it("blocks cursor advancement on incorrect character", () => {
			let state = createTypingState("abc");
			state.config.stopOnError = "letter";

			state = processKeystroke(state, "x", 1000);

			expect(state.words[0].characters[0].status).toBe("incorrect");
			expect(state.currentCharIndex).toBe(0);
		});

		it("allows backspace on incorrect character in letter mode", () => {
			let state = createTypingState("abc");
			state.config.stopOnError = "letter";

			state = processKeystroke(state, "x", 1000);
			expect(state.words[0].characters[0].status).toBe("incorrect");

			state = processKeystroke(state, "Backspace", 1001);
			expect(state.words[0].characters[0].status).toBe("pending");
			expect(state.currentCharIndex).toBe(0);
		});

		it("increments mistakeCount on each wrong attempt", () => {
			let state = createTypingState("abc");
			state.config.stopOnError = "letter";

			state = processKeystroke(state, "x", 1000);
			expect(state.words[0].characters[0].mistakeCount).toBe(1);
			expect(state.currentCharIndex).toBe(0);

			state = processKeystroke(state, "y", 1001);
			expect(state.words[0].characters[0].mistakeCount).toBe(2);
			expect(state.currentCharIndex).toBe(0);
		});

		it("preserves mistakeCount on backspace", () => {
			let state = createTypingState("abc");
			state.config.stopOnError = "letter";

			state = processKeystroke(state, "x", 1000);
			state = processKeystroke(state, "Backspace", 1001);
			expect(state.words[0].characters[0].mistakeCount).toBe(1);
			expect(state.words[0].characters[0].status).toBe("pending");
		});

		it("preserves mistakeCount after correct keystroke following mistakes", () => {
			let state = createTypingState("abc");
			state.config.stopOnError = "letter";

			state = processKeystroke(state, "x", 1000);
			state = processKeystroke(state, "Backspace", 1001);
			state = processKeystroke(state, "a", 1002);
			expect(state.words[0].characters[0].status).toBe("correct");
			expect(state.words[0].characters[0].mistakeCount).toBe(1);
			expect(state.currentCharIndex).toBe(1);
		});

		it("auto-advances after 5 mistakes", () => {
			let state = createTypingState("abc");
			state.config.stopOnError = "letter";

			for (let i = 0; i < 4; i++) {
				state = processKeystroke(state, "x", 1000 + i);
				expect(state.currentCharIndex).toBe(0);
			}
			expect(state.words[0].characters[0].mistakeCount).toBe(4);

			state = processKeystroke(state, "x", 1005);
			expect(state.words[0].characters[0].mistakeCount).toBe(5);
			expect(state.words[0].characters[0].status).toBe("incorrect");
			expect(state.currentCharIndex).toBe(1);
		});
	});

	describe("mistake counting in off mode", () => {
		it("sets mistakeCount on incorrect character", () => {
			const state = createTypingState("abc");
			const next = processKeystroke(state, "x", 1000);
			expect(next.words[0].characters[0].mistakeCount).toBe(1);
			expect(next.currentCharIndex).toBe(1);
		});

		it("does not increment mistakeCount on correct character", () => {
			const state = createTypingState("abc");
			const next = processKeystroke(state, "a", 1000);
			expect(next.words[0].characters[0].mistakeCount).toBe(0);
		});
	});

	describe("diacritics matching", () => {
		it("accepts base character for diacritical expected character", () => {
			// "caf\u00E9" = "café" — last char is é (e-acute)
			const state = createTypingState("caf\u00E9");
			let next = processKeystroke(state, "c", 1000);
			next = processKeystroke(next, "a", 1001);
			next = processKeystroke(next, "f", 1002);
			next = processKeystroke(next, "e", 1003); // "e" should match "é"

			expect(next.words[0].characters[3].status).toBe("correct");
			expect(next.endTime).not.toBeNull();
		});

		it("rejects wrong base character for diacritical expected", () => {
			const state = createTypingState("\u017E"); // ž (z-caron)
			const next = processKeystroke(state, "a", 1000);

			expect(next.words[0].characters[0].status).toBe("incorrect");
		});
	});

	describe("stop on error: word", () => {
		it("allows typing within current word normally", () => {
			let state = createTypingState("ab cd");
			state.config.stopOnError = "word";

			state = processKeystroke(state, "a", 1000);
			expect(state.currentCharIndex).toBe(1);

			state = processKeystroke(state, "x", 1001);
			expect(state.currentCharIndex).toBe(2);
			expect(state.words[0].characters[1].status).toBe("incorrect");
		});

		it("blocks word transition when current word has errors", () => {
			let state = createTypingState("ab cd");
			state.config.stopOnError = "word";

			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "x", 1001);
			state = processKeystroke(state, " ", 1002);

			expect(state.currentWordIndex).toBe(0);
			expect(state.currentCharIndex).toBe(0);
			for (const char of state.words[0].characters) {
				if (char.expected !== " ") {
					expect(char.status).toBe("pending");
				}
			}
		});

		it("allows word transition when all chars correct", () => {
			let state = createTypingState("ab cd");
			state.config.stopOnError = "word";

			state = processKeystroke(state, "a", 1000);
			state = processKeystroke(state, "b", 1001);
			state = processKeystroke(state, " ", 1002);

			expect(state.currentWordIndex).toBe(1);
			expect(state.currentCharIndex).toBe(0);
		});

		it("resets mistakeCount on word characters when word is reset", () => {
			let state = createTypingState("ab cd");
			state.config.stopOnError = "word";

			state = processKeystroke(state, "x", 1000);
			state = processKeystroke(state, "b", 1001);
			state = processKeystroke(state, " ", 1002);

			expect(state.words[0].characters[0].mistakeCount).toBe(0);
			expect(state.words[0].characters[1].mistakeCount).toBe(0);
		});
	});
});

describe("applyKeystroke", () => {
	it("updates the state in place, keeping the words array and other words", () => {
		const state = createTypingState("ab cd ef");
		const words = state.words;
		const [first, second, third] = words;

		for (const [i, key] of ["a", "b", " "].entries()) {
			applyKeystroke(state, key, 1000 + i);
		}
		applyKeystroke(state, "Backspace", 1003);

		expect(state.words).toBe(words);
		expect(state.words[0]).toBe(first);
		expect(state.words[1]).toBe(second);
		expect(state.words[2]).toBe(third);
		expect(third.characters.every((c) => c.status === "pending")).toBe(true);
		expect(first.characters[2].status).toBe("pending");
		expect(state.currentWordIndex).toBe(0);
		expect(state.currentCharIndex).toBe(2);
	});
});

describe("processKeystroke purity", () => {
	it("leaves the input state untouched", () => {
		const state = createTypingState("ab cd");
		const before = structuredClone(state);

		processKeystroke(state, "a", 1000);
		processKeystroke(processKeystroke(state, "x", 1000), "Backspace", 1001);

		expect(state).toEqual(before);
	});
});

describe("applyKeystroke outcome", () => {
	it("reports a correct and an incorrect key", () => {
		const state = createTypingState("ab");
		expect(applyKeystroke(state, "a", 1000)).toBe("correct");
		expect(applyKeystroke(state, "x", 1001)).toBe("incorrect");
	});

	it("reports the word-completing key as correct when stop on error word resets the word", () => {
		const state = createTypingState("ab cd");
		state.config.stopOnError = "word";
		applyKeystroke(state, "x", 1000);
		applyKeystroke(state, "b", 1001);
		expect(applyKeystroke(state, " ", 1002)).toBe("correct");
		expect(state.currentCharIndex).toBe(0);
	});

	it("reports a backspace that changes the state", () => {
		const state = createTypingState("ab");
		applyKeystroke(state, "a", 1000);
		expect(applyKeystroke(state, "Backspace", 1001)).toBe("backspace");
	});

	it("reports nothing for a backspace at the very start", () => {
		const state = createTypingState("ab");
		expect(applyKeystroke(state, "Backspace", 1000)).toBeNull();
	});

	it("reports nothing for an ignored key or a finished test", () => {
		const state = createTypingState("a");
		expect(applyKeystroke(state, "Shift", 1000)).toBeNull();
		applyKeystroke(state, "a", 1001);
		expect(state.endTime).not.toBeNull();
		expect(applyKeystroke(state, "a", 1002)).toBeNull();
	});
});

describe("keystroke counts", () => {
	it("starts at zero", () => {
		const state = createTypingState("ab");
		expect(state.keystrokes).toEqual({ correct: 0, incorrect: 0 });
	});

	it("counts every character key, including mistakes later corrected", () => {
		const state = createTypingState("ab cd");
		applyKeystroke(state, "x", 1000);
		applyKeystroke(state, "Backspace", 1001);
		applyKeystroke(state, "a", 1002);
		applyKeystroke(state, "b", 1003);
		applyKeystroke(state, "q", 1004);
		applyKeystroke(state, "Backspace", 1005);
		applyKeystroke(state, " ", 1006);

		expect(state.words[0].characters.every((c) => c.status === "correct")).toBe(
			true,
		);
		expect(state.keystrokes).toEqual({ correct: 3, incorrect: 2 });
	});

	it("counts a correct key retyped after backspacing it", () => {
		const state = createTypingState("ab");
		applyKeystroke(state, "a", 1000);
		applyKeystroke(state, "Backspace", 1001);
		applyKeystroke(state, "a", 1002);
		expect(state.keystrokes).toEqual({ correct: 2, incorrect: 0 });
	});

	it("keeps mistakes a stop on error word reset wipes from the word", () => {
		const state = createTypingState("ab cd");
		state.config.stopOnError = "word";
		applyKeystroke(state, "x", 1000);
		applyKeystroke(state, "b", 1001);
		applyKeystroke(state, " ", 1002);
		expect(state.currentCharIndex).toBe(0);
		expect(state.keystrokes).toEqual({ correct: 2, incorrect: 1 });
	});

	it("counts blocked stop on error letter keys", () => {
		const state = createTypingState("ab");
		state.config.stopOnError = "letter";
		applyKeystroke(state, "x", 1000);
		applyKeystroke(state, "y", 1001);
		applyKeystroke(state, "a", 1002);
		expect(state.keystrokes).toEqual({ correct: 1, incorrect: 2 });
	});

	it("ignores modifier keys, backspaces and keys after the end", () => {
		const state = createTypingState("a");
		applyKeystroke(state, "Shift", 1000);
		applyKeystroke(state, "Backspace", 1001);
		applyKeystroke(state, "a", 1002);
		applyKeystroke(state, "a", 1003);
		expect(state.keystrokes).toEqual({ correct: 1, incorrect: 0 });
	});

	it("leaves the input counts untouched in the pure form", () => {
		const state = createTypingState("ab");
		const next = processKeystroke(state, "a", 1000);
		expect(next.keystrokes.correct).toBe(1);
		expect(state.keystrokes.correct).toBe(0);
	});
});

describe("key activity", () => {
	it("starts with no character key", () => {
		expect(createTypingState("ab").activity.lastAt).toBeNull();
	});

	it("keeps the last character key's time when Backspace erases it", () => {
		const state = createTypingState("ab cd");
		applyKeystroke(state, "a", 1000);
		applyKeystroke(state, "x", 1500);
		applyKeystroke(state, "Backspace", 1700);
		applyKeystroke(state, "Shift", 1800);
		expect(state.activity.lastAt).toBe(1500);
	});

	it("keeps it through a stop on error word reset", () => {
		const state = createTypingState("ab cd");
		state.config.stopOnError = "word";
		applyKeystroke(state, "x", 1000);
		applyKeystroke(state, "b", 1001);
		applyKeystroke(state, " ", 1002);
		expect(state.words[0].characters.every((c) => c.timestamp === null)).toBe(
			true,
		);
		expect(state.activity.lastAt).toBe(1002);
	});

	it("leaves the input activity untouched in the pure form", () => {
		const state = createTypingState("ab");
		const next = processKeystroke(state, "a", 1000);
		expect(next.activity.lastAt).toBe(1000);
		expect(state.activity.lastAt).toBeNull();
	});
});

describe("per-second key activity", () => {
	it("counts character keys and mistakes in each second, erased ones included", () => {
		const state = createTypingState("ab cd");
		applyKeystroke(state, "a", 1000);
		applyKeystroke(state, "x", 1500);
		applyKeystroke(state, "Backspace", 1600);
		applyKeystroke(state, "b", 2100);
		applyKeystroke(state, "Shift", 2200);
		applyKeystroke(state, "q", 4200);
		expect(state.activity.keysPerSecond).toEqual([2, 1, 0, 1]);
		expect(state.activity.errorsPerSecond).toEqual([1, 0, 0, 1]);
	});

	it("keeps keys a stop on error word reset wipes from the word", () => {
		const state = createTypingState("ab cd");
		state.config.stopOnError = "word";
		applyKeystroke(state, "x", 1000);
		applyKeystroke(state, "b", 1100);
		applyKeystroke(state, " ", 1200);
		expect(state.activity.keysPerSecond).toEqual([3]);
		expect(state.activity.errorsPerSecond).toEqual([1]);
	});

	it("leaves the input's counts untouched in the pure form", () => {
		const state = createTypingState("ab");
		const first = processKeystroke(state, "a", 1000);
		const second = processKeystroke(first, "b", 1100);
		expect(second.activity.keysPerSecond).toEqual([2]);
		expect(first.activity.keysPerSecond).toEqual([1]);
		expect(state.activity.keysPerSecond).toEqual([]);
	});
});
