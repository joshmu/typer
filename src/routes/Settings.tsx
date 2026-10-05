import { createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import SettingsPreview from "@/components/settings/SettingsPreview";
import ThemePicker from "@/components/settings/ThemePicker";
import type { CaretStyle } from "@/components/typing/Caret";
import type { StopOnError } from "@/lib/core/types";
import { typingFontSize } from "@/lib/preferences";
import { usePreferences } from "@/lib/preferences-context";
import { applyTheme, getTheme } from "@/lib/themes";

function Section(props: {
	title: string;
	hint?: string;
	children: JSX.Element;
}) {
	return (
		<section class="grid gap-x-10 gap-y-5 border-t border-text/[0.08] py-9 sm:grid-cols-[9.5rem_1fr]">
			<div class="flex flex-col gap-1.5">
				<h2 class="font-display text-sm font-semibold tracking-wide text-text">
					{props.title}
				</h2>
				<Show when={props.hint}>
					<p class="font-display text-xs leading-relaxed text-text-sub">
						{props.hint}
					</p>
				</Show>
			</div>
			<div class="flex min-w-0 flex-col gap-6">{props.children}</div>
		</section>
	);
}

function Row(props: {
	label: string;
	description?: string;
	children: JSX.Element;
}) {
	return (
		<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
			<div class="flex min-w-0 flex-col gap-1">
				<span class="font-display text-sm font-medium text-text">
					{props.label}
				</span>
				<Show when={props.description}>
					<p class="font-display text-xs text-text-sub">{props.description}</p>
				</Show>
			</div>
			{props.children}
		</div>
	);
}

function Segmented<T extends string | number>(props: {
	label: string;
	options: readonly T[];
	value: T;
	onSelect: (v: T) => void;
	renderLabel?: (v: T) => string;
}) {
	return (
		<fieldset class="flex items-center gap-0.5 rounded-lg bg-bg-secondary p-1 ring-1 ring-text/[0.06]">
			<legend class="sr-only">{props.label}</legend>
			<For each={[...props.options]}>
				{(opt) => (
					<button
						type="button"
						aria-pressed={props.value === opt}
						class="rounded-md px-3 py-1.5 font-display text-sm font-medium tracking-wide tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
						classList={{
							"bg-primary text-on-primary shadow-sm": props.value === opt,
							"text-text-sub hover:text-text": props.value !== opt,
						}}
						onClick={() => props.onSelect(opt)}
					>
						{props.renderLabel ? props.renderLabel(opt) : String(opt)}
					</button>
				)}
			</For>
		</fieldset>
	);
}

function Toggle(props: {
	label: string;
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			aria-label={props.label}
			aria-pressed={props.value}
			class="relative h-6 w-11 shrink-0 rounded-full outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
			classList={{
				"bg-primary shadow-[0_0_12px_color-mix(in_srgb,var(--primary)_35%,transparent)]":
					props.value,
				"bg-text-sub/30": !props.value,
			}}
			onClick={() => props.onChange(!props.value)}
		>
			<span
				class="absolute top-1 size-4 rounded-full shadow-sm transition-[left,background-color] duration-200 ease-out"
				classList={{
					"left-6 bg-on-primary": props.value,
					"left-1 bg-bg": !props.value,
				}}
			/>
		</button>
	);
}

export default function Settings() {
	const [prefs, setPrefs] = usePreferences();
	const [previewing, setPreviewing] = createSignal<string | null>(null);

	// Hovering a theme paints the page in it; leaving puts the saved one back.
	function previewTheme(name: string | null) {
		setPreviewing(name);
		applyTheme(getTheme(name ?? prefs.theme));
	}
	onCleanup(() => {
		if (previewing()) applyTheme(getTheme(prefs.theme));
	});

	return (
		<main class="flex flex-1 flex-col items-center px-5 pb-24 sm:px-8">
			<div class="w-full max-w-3xl">
				<header class="flex flex-col gap-1.5 pt-8 pb-6 sm:pt-12">
					<h1 class="font-display text-3xl font-semibold tracking-tight text-text">
						Settings
					</h1>
					<p class="font-display text-sm text-text-sub">
						Saved as you change them. Hover a theme to try it on.
					</p>
				</header>

				<div class="z-20 pt-3 pb-6 sm:sticky sm:top-0 sm:backdrop-blur-md">
					<SettingsPreview
						themeLabel={getTheme(previewing() ?? prefs.theme).label}
					/>
				</div>

				<Section
					title="Theme"
					hint="Every theme is checked for readable contrast."
				>
					<ThemePicker
						currentTheme={prefs.theme}
						onSelect={(name) => setPrefs("theme", name)}
						onPreview={previewTheme}
					/>
				</Section>

				<Section title="Caret">
					<Row label="Style">
						<Segmented
							label="caret style"
							options={["line", "block", "underline"] as const}
							value={prefs.caretStyle}
							onSelect={(v) => setPrefs("caretStyle", v as CaretStyle)}
						/>
					</Row>
					<Row
						label="Smooth caret"
						description="Glide between characters instead of jumping."
					>
						<Toggle
							label="Smooth caret"
							value={prefs.smoothCaret}
							onChange={(v) => setPrefs("smoothCaret", v)}
						/>
					</Row>
				</Section>

				<Section title="Text">
					<Row label="Size" description="The size of the text you type.">
						<Segmented
							label="font size"
							options={[14, 16, 18, 20, 24] as const}
							value={prefs.fontSize}
							onSelect={(v) => setPrefs("fontSize", v)}
							renderLabel={(v) => `${typingFontSize(v)}px`}
						/>
					</Row>
				</Section>

				<Section title="Typing">
					<Row
						label="Stop on error"
						description="Hold the cursor on a mistake until you fix it."
					>
						<Segmented
							label="stop on error"
							options={["off", "letter", "word"] as const}
							value={prefs.stopOnError}
							onSelect={(v) => setPrefs("stopOnError", v as StopOnError)}
						/>
					</Row>
					<Row label="Live WPM" description="Show your speed while you type.">
						<Toggle
							label="Live WPM"
							value={prefs.showLiveWpm}
							onChange={(v) => setPrefs("showLiveWpm", v)}
						/>
					</Row>
				</Section>

				<Section title="Sound">
					<Row
						label="Key sound"
						description="A soft click on every keystroke. Try it in the preview."
					>
						<Toggle
							label="Key sound"
							value={prefs.keySound}
							onChange={(v) => setPrefs("keySound", v)}
						/>
					</Row>
				</Section>
			</div>
		</main>
	);
}
