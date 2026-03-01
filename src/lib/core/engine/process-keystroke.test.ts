import { describe, expect, it } from "vitest";
import { createTypingState } from "../types/test-fixtures";
import { processKeystroke } from "./process-keystroke";

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
