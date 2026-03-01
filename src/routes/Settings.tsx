import ThemePicker from "@/components/settings/ThemePicker";
import type { CaretStyle } from "@/components/typing/Caret";
import type { StopOnError } from "@/lib/core/types";
import { usePreferences } from "@/lib/preferences-context";
import { applyTheme, getTheme } from "@/lib/themes";

function buttonClass(active: boolean): string {
	return `px-4 py-2 text-sm rounded border transition-colors ${
		active
			? "border-primary text-primary bg-primary/10"
			: "border-text-sub/20 text-text-sub hover:text-text"
	}`;
}

function ButtonGroup<T extends string | number>(props: {
	label: string;
	description?: string;
	options: readonly T[];
	value: T;
	onSelect: (v: T) => void;
	renderLabel?: (v: T) => string;
}) {
	return (
		<div class="flex flex-col gap-3">
			<span class="text-xs uppercase tracking-widest text-text-sub">
				{props.label}
			</span>
			{props.description && (
				<p class="text-xs text-text-sub">{props.description}</p>
			)}
			<div class="flex gap-2">
				{props.options.map((opt) => (
					<button
						type="button"
						class={buttonClass(props.value === opt)}
						onClick={() => props.onSelect(opt)}
					>
						{props.renderLabel ? props.renderLabel(opt) : String(opt)}
					</button>
				))}
			</div>
		</div>
	);
}

function ToggleRow(props: {
	label: string;
	description: string;
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div class="flex items-center justify-between">
			<div>
				<span class="text-text">{props.label}</span>
				<p class="text-xs text-text-sub mt-1">{props.description}</p>
			</div>
			<button
				type="button"
				class={`w-12 h-6 rounded-full transition-colors relative ${
					props.value ? "bg-primary" : "bg-text-sub/30"
				}`}
				onClick={() => props.onChange(!props.value)}
			>
				<span
					class={`absolute top-1 w-4 h-4 rounded-full bg-bg transition-[left] ${
						props.value ? "left-7" : "left-1"
					}`}
				/>
			</button>
		</div>
	);
}

export default function Settings() {
	const [prefs, setPrefs] = usePreferences();

	return (
		<main class="flex flex-col items-center flex-1 px-8 py-12">
			<div class="w-full max-w-2xl flex flex-col gap-10">
				<h1 class="text-2xl font-bold text-primary">Settings</h1>

				<ThemePicker
					currentTheme={prefs.theme}
					onSelect={(name) => {
						setPrefs("theme", name);
						applyTheme(getTheme(name));
					}}
				/>

				<ButtonGroup
					label="caret style"
					options={["line", "block", "underline"] as const}
					value={prefs.caretStyle}
					onSelect={(v) => setPrefs("caretStyle", v as CaretStyle)}
				/>

				<ButtonGroup
					label="stop on error"
					description="Control cursor behavior when you mistype a character"
					options={["off", "letter", "word"] as const}
					value={prefs.stopOnError}
					onSelect={(v) => setPrefs("stopOnError", v as StopOnError)}
				/>

				<ToggleRow
					label="Smooth caret"
					description="Animate caret movement between characters"
					value={prefs.smoothCaret}
					onChange={(v) => setPrefs("smoothCaret", v)}
				/>

				<ToggleRow
					label="Live WPM"
					description="Show WPM counter during typing"
					value={prefs.showLiveWpm}
					onChange={(v) => setPrefs("showLiveWpm", v)}
				/>

				<ToggleRow
					label="Sound on keypress"
					description="Play a sound when typing"
					value={prefs.soundEnabled}
					onChange={(v) => setPrefs("soundEnabled", v)}
				/>

				<ButtonGroup
					label="font size"
					options={[14, 16, 18, 20, 24] as const}
					value={prefs.fontSize}
					onSelect={(v) => setPrefs("fontSize", v)}
					renderLabel={(v) => `${v}px`}
				/>
			</div>
		</main>
	);
}
