import ThemePicker from "@/components/settings/ThemePicker";
import type { CaretStyle } from "@/components/typing/Caret";
import { usePreferences } from "@/lib/preferences-context";
import { applyTheme, getTheme } from "@/lib/themes";

export default function Settings() {
	const [prefs, setPrefs] = usePreferences();

	return (
		<main class="flex flex-col items-center flex-1 px-8 py-12">
			<div class="w-full max-w-2xl flex flex-col gap-10">
				<h1 class="text-2xl font-bold text-primary">Settings</h1>

				{/* Theme */}
				<ThemePicker
					currentTheme={prefs.theme}
					onSelect={(name) => {
						setPrefs("theme", name);
						applyTheme(getTheme(name));
					}}
				/>

				{/* Caret Style */}
				<div class="flex flex-col gap-3">
					<span class="text-xs uppercase tracking-widest text-text-sub">
						caret style
					</span>
					<div class="flex gap-2">
						{(["line", "block", "underline"] as const).map((style) => (
							<button
								type="button"
								class={`px-4 py-2 text-sm rounded border transition-colors ${
									prefs.caretStyle === style
										? "border-primary text-primary bg-primary/10"
										: "border-text-sub/20 text-text-sub hover:text-text"
								}`}
								onClick={() => setPrefs("caretStyle", style as CaretStyle)}
							>
								{style}
							</button>
						))}
					</div>
				</div>

				{/* Smooth Caret */}
				<div class="flex items-center justify-between">
					<div>
						<span class="text-text">Smooth caret</span>
						<p class="text-xs text-text-sub mt-1">
							Animate caret movement between characters
						</p>
					</div>
					<button
						type="button"
						class={`w-12 h-6 rounded-full transition-colors relative ${
							prefs.smoothCaret ? "bg-primary" : "bg-text-sub/30"
						}`}
						onClick={() => setPrefs("smoothCaret", !prefs.smoothCaret)}
					>
						<span
							class={`absolute top-1 w-4 h-4 rounded-full bg-bg transition-[left] ${
								prefs.smoothCaret ? "left-7" : "left-1"
							}`}
						/>
					</button>
				</div>

				{/* Live WPM */}
				<div class="flex items-center justify-between">
					<div>
						<span class="text-text">Live WPM</span>
						<p class="text-xs text-text-sub mt-1">
							Show WPM counter during typing
						</p>
					</div>
					<button
						type="button"
						class={`w-12 h-6 rounded-full transition-colors relative ${
							prefs.showLiveWpm ? "bg-primary" : "bg-text-sub/30"
						}`}
						onClick={() => setPrefs("showLiveWpm", !prefs.showLiveWpm)}
					>
						<span
							class={`absolute top-1 w-4 h-4 rounded-full bg-bg transition-[left] ${
								prefs.showLiveWpm ? "left-7" : "left-1"
							}`}
						/>
					</button>
				</div>

				{/* Sound */}
				<div class="flex items-center justify-between">
					<div>
						<span class="text-text">Sound on keypress</span>
						<p class="text-xs text-text-sub mt-1">
							Play a sound when typing
						</p>
					</div>
					<button
						type="button"
						class={`w-12 h-6 rounded-full transition-colors relative ${
							prefs.soundEnabled ? "bg-primary" : "bg-text-sub/30"
						}`}
						onClick={() => setPrefs("soundEnabled", !prefs.soundEnabled)}
					>
						<span
							class={`absolute top-1 w-4 h-4 rounded-full bg-bg transition-[left] ${
								prefs.soundEnabled ? "left-7" : "left-1"
							}`}
						/>
					</button>
				</div>

				{/* Font Size */}
				<div class="flex flex-col gap-3">
					<span class="text-xs uppercase tracking-widest text-text-sub">
						font size
					</span>
					<div class="flex gap-2">
						{([14, 16, 18, 20, 24] as const).map((size) => (
							<button
								type="button"
								class={`px-3 py-1 text-sm rounded border transition-colors ${
									prefs.fontSize === size
										? "border-primary text-primary bg-primary/10"
										: "border-text-sub/20 text-text-sub hover:text-text"
								}`}
								onClick={() => setPrefs("fontSize", size)}
							>
								{size}px
							</button>
						))}
					</div>
				</div>
			</div>
		</main>
	);
}
