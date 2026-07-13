import { nextInt } from "../sim/rng";

/**
 * Boss word chains are whole public-domain passages typed as one long sentence —
 * a boss's `hp` equals its passage length, so felling it is a sustained typing
 * gauntlet rather than a 4-5 word chip. Every passage is stored PRE-NORMALIZED
 * and PRE-SPLIT: lowercase, punctuation stripped, apostrophes/hyphens removed so
 * each token is plain ascii letters (`/^[a-z]+$/`). Each passage is 15-25 words
 * after normalization (asserted in `boss-texts.test.ts`).
 *
 * Sources are all genuinely public domain — proverbs and pre-1900 literature (plus
 * a few early-1900s works long out of copyright): Shakespeare, the KJV Bible,
 * Aesop, Sun Tzu (Giles 1910), Marcus Aurelius, and canonical American/English
 * verse and prose. No modern or copyrighted text is reproduced.
 */
export const BOSS_TEXTS: string[][] = [
	// Shakespeare — Hamlet, "To be or not to be"
	"to be or not to be that is the question whether tis nobler in the mind to suffer".split(
		" ",
	),
	// Shakespeare — As You Like It, "All the world's a stage"
	"all the worlds a stage and all the men and women merely players they have their exits and their entrances".split(
		" ",
	),
	// Sun Tzu — The Art of War (Lionel Giles translation, 1910)
	"if you know the enemy and know yourself you need not fear the result of a hundred battles".split(
		" ",
	),
	// Aesop — "The Hare and the Tortoise" moral
	"slow and steady wins the race for the swift are not always victors nor do the strong prevail forever".split(
		" ",
	),
	// Proverb — necessity and cunning
	"necessity is the mother of invention and the cunning fox escapes the hound by trusting his own quick wits".split(
		" ",
	),
	// Marcus Aurelius — Meditations
	"you have power over your mind not outside events realise this and you will find great strength within yourself".split(
		" ",
	),
	// KJV Bible — Proverbs 16:18
	"pride goeth before destruction and a haughty spirit before a fall but the humble in heart shall inherit wisdom".split(
		" ",
	),
	// Lincoln — Gettysburg Address (1863)
	"four score and seven years ago our fathers brought forth on this continent a new nation conceived in liberty".split(
		" ",
	),
	// U.S. Declaration of Independence (1776)
	"we hold these truths to be self evident that all men are created equal and endowed with certain unalienable rights".split(
		" ",
	),
	// Dickens — A Tale of Two Cities (1859)
	"it was the best of times it was the worst of times it was the age of wisdom".split(
		" ",
	),
	// Melville — Moby-Dick (1851)
	"call me ishmael some years ago never mind how long precisely i thought i would sail about a little".split(
		" ",
	),
	// Thoreau — Walden (1854)
	"i went to the woods because i wished to live deliberately and front only the essential facts of life".split(
		" ",
	),
	// Frost — The Road Not Taken (1916)
	"two roads diverged in a yellow wood and sorry i could not travel both and be one traveller".split(
		" ",
	),
	// Shakespeare — Sonnet 18
	"shall i compare thee to a summers day thou art more lovely and more temperate than the fair spring".split(
		" ",
	),
	// Shakespeare — Macbeth, "Tomorrow and tomorrow"
	"tomorrow and tomorrow and tomorrow creeps in this petty pace from day to day to the last syllable of time".split(
		" ",
	),
	// Poe — The Raven (1845)
	"once upon a midnight dreary while i pondered weak and weary over many a quaint and curious volume".split(
		" ",
	),
	// The Golden Rule — proverb
	"do unto others as you would have them do unto you for kindness given freely returns to the giver tenfold".split(
		" ",
	),
	// Wordsworth — I Wandered Lonely as a Cloud (1807)
	"i wandered lonely as a cloud that floats on high over vales and hills when all at once i saw".split(
		" ",
	),
	// Blake — The Tyger (1794)
	"tyger tyger burning bright in the forests of the night what immortal hand or eye could frame thy fearful symmetry".split(
		" ",
	),
	// Austen — Pride and Prejudice (1813)
	"it is a truth universally acknowledged that a single man in possession of a good fortune must want a wife".split(
		" ",
	),
];

/**
 * Seeded pick of a boss passage. Prefers passages whose FIRST word's initial is
 * not in `excludeInitials` (the field's live initials + active powerups), so the
 * boss's acquiring keystroke stays unambiguous; falls back to the full set when
 * every first-initial is excluded. Returns a COPY of the passage so the caller
 * (the enemy's mutable `words`) can never mutate the shared authored data, and
 * threads the rng deterministically.
 */
export function pickBossText(
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [words: string[], next: number] {
	const survivors = BOSS_TEXTS.filter((p) => !excludeInitials.has(p[0][0]));
	const usable = survivors.length > 0 ? survivors : BOSS_TEXTS;
	const [i, next] = nextInt(rngState, usable.length);
	return [usable[i].slice(), next];
}
