import { type ParentProps, Show, createSignal } from "solid-js";
import ThemePicker from "@/components/settings/ThemePicker";
import { usePreferences } from "@/lib/preferences-context";
import { applyTheme, getTheme } from "@/lib/themes";

export default function RootLayout(props: ParentProps) {
	const [prefs, setPrefs] = usePreferences();
	const [showThemes, setShowThemes] = createSignal(false);

	function handleThemeSelect(name: string) {
		setPrefs("theme", name);
		applyTheme(getTheme(name));
		setShowThemes(false);
	}

	return (
		<div class="min-h-screen bg-bg text-text flex flex-col">
			<header class="flex items-center justify-between px-8 py-4">
				<a href="/" class="text-2xl font-bold text-primary no-underline">
					Typer
				</a>
				<nav class="flex gap-4 items-center">
					<a href="/" class="text-text-sub hover:text-text no-underline">
						Home
					</a>
					<a href="/about" class="text-text-sub hover:text-text no-underline">
						About
					</a>
					<button
						type="button"
						class="text-text-sub hover:text-primary text-sm transition-colors"
						onClick={() => setShowThemes(!showThemes())}
					>
						Theme
					</button>
				</nav>
			</header>
			<Show when={showThemes()}>
				<div class="px-8 pb-4">
					<ThemePicker
						currentTheme={prefs.theme}
						onSelect={handleThemeSelect}
					/>
				</div>
			</Show>
			{props.children}
		</div>
	);
}
