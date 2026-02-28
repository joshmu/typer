import { For } from "solid-js";
import { type Theme, applyTheme, themeNames, themes } from "@/lib/themes";

interface ThemePickerProps {
	currentTheme: string;
	onSelect: (name: string) => void;
}

function ThemeSwatch(props: {
	theme: Theme;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			class={`flex flex-col items-center gap-2 p-3 rounded border transition-colors ${
				props.active
					? "border-primary bg-bg-secondary"
					: "border-text-sub/20 hover:border-text-sub/40"
			}`}
			onClick={() => {
				applyTheme(props.theme);
				props.onSelect();
			}}
			title={props.theme.label}
		>
			{/* Color swatches */}
			<div class="flex gap-1">
				<span
					class="w-4 h-4 rounded-full"
					style={{ background: props.theme.bg }}
				/>
				<span
					class="w-4 h-4 rounded-full"
					style={{ background: props.theme.primary }}
				/>
				<span
					class="w-4 h-4 rounded-full"
					style={{ background: props.theme.text }}
				/>
			</div>
			<span class="text-xs text-text-sub">{props.theme.label}</span>
		</button>
	);
}

export default function ThemePicker(props: ThemePickerProps) {
	return (
		<div class="flex flex-col gap-3">
			<span class="text-xs uppercase tracking-widest text-text-sub">
				theme
			</span>
			<div class="grid grid-cols-4 gap-2">
				<For each={themeNames}>
					{(name) => (
						<ThemeSwatch
							theme={themes[name]}
							active={props.currentTheme === name}
							onSelect={() => props.onSelect(name)}
						/>
					)}
				</For>
			</div>
		</div>
	);
}
