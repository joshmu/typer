import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { pulseClass } from "@/components/typing/pulse-class";
import { keySoundFor } from "@/lib/key-sound";
import { typingFontSize } from "@/lib/preferences";
import { usePreferences } from "@/lib/preferences-context";
import { getTheme } from "@/lib/themes";
import {
	charClasses,
	createPreviewState,
	type PreviewState,
	pressKey,
} from "./preview-state";

const SAMPLE = "a reading lamp in a dark room";
/** A finished-looking demo line: one corrected char, one live miss. */
const DEMO_KEYS = [..."a readimg", "Backspace", "Backspace", ..."ng lx"];
const IDLE_MS = 1500;

interface CaretBox {
	left: number;
	top: number;
	width: number;
}

/**
 * A live sample of the typing text in the current theme, caret style, size
 * and sound. Click it to type; it is a scratch line and records nothing.
 */
export default function SettingsPreview(props: { themeLabel?: string }) {
	const [prefs] = usePreferences();
	const [state, setState] = createSignal<PreviewState>(
		createPreviewState(SAMPLE, DEMO_KEYS),
	);
	const [focused, setFocused] = createSignal(false);
	const [idle, setIdle] = createSignal(true);
	const [box, setBox] = createSignal<CaretBox>({ left: 0, top: 0, width: 0 });
	let line: HTMLDivElement | undefined;
	let caretEl: HTMLDivElement | undefined;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let touched = false;

	const classes = () => charClasses(state());
	const lineHeight = () => typingFontSize(prefs.fontSize) * 2;
	const label = () => props.themeLabel ?? getTheme(prefs.theme).label;

	// Not the typing hot path: a settings scratch line can read layout.
	function measure() {
		const chars = line?.children;
		const el = chars?.[state().cursor] as HTMLElement | undefined;
		if (!el) return;
		setBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth });
	}

	createEffect(() => {
		state();
		prefs.fontSize;
		requestAnimationFrame(measure);
	});

	onMount(() => {
		const ro = new ResizeObserver(() => measure());
		if (line) ro.observe(line);
		document.fonts?.ready.then(measure).catch(() => {});
		onCleanup(() => ro.disconnect());
	});
	onCleanup(() => clearTimeout(idleTimer));

	function onKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === "Escape") {
			(e.currentTarget as HTMLElement).blur();
			return;
		}
		if (e.key !== "Backspace" && e.key.length !== 1) return;
		e.preventDefault();
		const from = touched ? state() : createPreviewState(SAMPLE);
		touched = true;
		const { state: next, ok } = pressKey(from, e.key);
		setState(next);
		if (ok === null) return;
		keySoundFor(prefs.keySound).play(ok);
		if (!ok) pulseClass(caretEl, "caret-miss", "caret-miss");
		setIdle(false);
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => setIdle(true), IDLE_MS);
	}

	const caretStyle = () => {
		const b = box();
		switch (prefs.caretStyle) {
			case "block":
				return {
					transform: `translate3d(${b.left}px, ${b.top}px, 0)`,
					width: `${b.width}px`,
					height: "1.5em",
				};
			case "underline":
				return {
					transform: `translate3d(${b.left}px, calc(${b.top}px + 1.35em), 0)`,
					width: `${b.width}px`,
					height: "2px",
				};
			default:
				return {
					transform: `translate3d(${b.left}px, ${b.top}px, 0)`,
					width: "2px",
					height: "1.5em",
				};
		}
	};

	return (
		<div
			class="rounded-xl bg-bg-secondary shadow-[0_18px_40px_-28px_rgb(0_0_0/0.9)] ring-1 ring-text/10 transition-shadow focus-within:ring-primary/40"
			data-testid="settings-preview"
		>
			<div class="flex items-center justify-between gap-4 border-b border-text/[0.06] px-5 py-2.5">
				<span class="font-display text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-text-sub">
					Preview
				</span>
				<ul class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 font-display text-[0.7rem] font-medium tracking-wide text-text-sub">
					<li class="flex items-center gap-1.5 text-text">
						<span class="size-1.5 rounded-full bg-primary" />
						{label()}
					</li>
					<li>{prefs.caretStyle} caret</li>
					<li class="tabular-nums">{typingFontSize(prefs.fontSize)}px</li>
					<li
						class="flex items-center gap-1"
						classList={{ "text-primary": prefs.keySound }}
						data-testid="preview-sound"
					>
						<SpeakerIcon on={prefs.keySound} />
						{prefs.keySound ? "sound on" : "sound off"}
					</li>
				</ul>
			</div>
			<div
				role="application"
				tabIndex={0}
				aria-label="Typing preview, type to try your settings"
				class="relative cursor-text px-5 outline-none"
				style={{
					"font-size": "var(--typing-font-size)",
					"line-height": `${lineHeight()}px`,
				}}
				onKeyDown={onKeyDown}
				onFocus={() => {
					setFocused(true);
					keySoundFor(prefs.keySound).warm();
				}}
				onBlur={() => setFocused(false)}
			>
				<div class="relative my-2 font-mono select-none">
					<div
						ref={caretEl}
						class="caret absolute left-0 top-0 will-change-transform"
						classList={{
							"caret-idle": idle(),
							"caret-glide transition-transform": prefs.smoothCaret,
							"caret-block": prefs.caretStyle === "block",
						}}
						style={caretStyle()}
						aria-hidden="true"
					/>
					<div ref={line}>
						<For each={Array.from(SAMPLE)}>
							{(ch, i) => <span class={classes()[i()]}>{ch}</span>}
						</For>
					</div>
				</div>
				<p class="pb-3 font-display text-[0.7rem] tracking-wide text-text-sub">
					<Show
						when={focused()}
						fallback={<>Click to try it. Nothing you type here is saved.</>}
					>
						Typing here records nothing.{" "}
						<kbd class="rounded border border-text/15 px-1 py-px text-[0.65rem]">
							esc
						</kbd>{" "}
						to leave.
					</Show>
				</p>
			</div>
		</div>
	);
}

function SpeakerIcon(props: { on: boolean }) {
	return (
		<svg
			viewBox="0 0 24 24"
			class="size-3.5"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M11 5 6 9H3v6h3l5 4V5Z" />
			<Show when={props.on} fallback={<path d="m22 9-6 6m0-6 6 6" />}>
				<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
			</Show>
		</svg>
	);
}
