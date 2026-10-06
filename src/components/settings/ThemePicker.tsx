import { For, onCleanup, onMount } from "solid-js";
import { DEFAULT_THEME, type Theme, themeNames, themes } from "@/lib/themes";

interface ThemePickerProps {
	currentTheme: string;
	onSelect: (name: string) => void;
	/** A theme to show while it is hovered or focused, or null to revert. */
	onPreview?: (name: string | null) => void;
}

/** Each tile is painted in its own theme, read from these local variables. */
function tileVars(theme: Theme): Record<string, string> {
	return {
		"--t-bg": theme.bg,
		"--t-text": theme.text,
		"--t-sub": theme.textSub,
		"--t-pending": theme.textPending,
		"--t-primary": theme.primary,
		"--t-error": theme.error,
		"--t-caret": theme.caret,
	};
}

function ThemeTile(props: {
	theme: Theme;
	active: boolean;
	featured: boolean;
	onSelect: () => void;
	onPreview: () => void;
	onEscape: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={props.theme.label}
			aria-pressed={props.active}
			style={tileVars(props.theme)}
			class="group relative flex flex-col justify-between gap-3 overflow-hidden rounded-lg bg-[var(--t-bg)] p-3.5 text-left outline-none ring-1 ring-[color-mix(in_srgb,var(--t-text)_10%,transparent)] transition-[box-shadow,transform] duration-150 ease-out hover:ring-[color-mix(in_srgb,var(--t-text)_28%,transparent)] focus-visible:ring-2 focus-visible:ring-text motion-safe:hover:-translate-y-0.5"
			classList={{
				"col-span-2 row-span-2 p-5": props.featured,
				"!ring-2 !ring-[var(--t-primary)] shadow-[0_10px_28px_-14px_var(--t-primary)]":
					props.active,
			}}
			onClick={() => props.onSelect()}
			onPointerEnter={() => props.onPreview()}
			onFocusIn={() => props.onPreview()}
			onKeyDown={(e) => {
				if (e.key !== "Escape") return;
				props.onEscape();
				e.currentTarget.blur();
			}}
		>
			<span aria-hidden="true" class="flex items-start justify-between gap-2">
				<span
					class="font-mono leading-none tracking-tight"
					classList={{
						"text-lg": !props.featured,
						"text-4xl": props.featured,
					}}
				>
					<span class="text-[var(--t-text)]">typ</span>
					<span
						class="relative -mx-px inline-block h-[1.15em] w-[2px] translate-y-[0.18em] rounded-[1px] bg-[var(--t-caret)] shadow-[0_0_8px_var(--t-caret)]"
						classList={{ "caret-idle": props.active }}
					/>
					<span class="text-[var(--t-pending)]">er</span>
				</span>
				<span class="flex shrink-0 gap-1 pt-1">
					<span class="size-2 rounded-full bg-[var(--t-primary)]" />
					<span class="size-2 rounded-full bg-[var(--t-error)]" />
				</span>
			</span>
			<span class="flex min-w-0 flex-col gap-1">
				<span
					class="truncate font-display font-semibold tracking-wide text-[var(--t-text)]"
					classList={{
						"text-xs": !props.featured,
						"text-sm": props.featured,
					}}
				>
					{props.theme.label}
				</span>
				{props.featured && (
					<span class="font-display text-[0.7rem] text-[var(--t-sub)]">
						the house theme
					</span>
				)}
			</span>
		</button>
	);
}

export default function ThemePicker(props: ThemePickerProps) {
	let grid: HTMLDivElement | undefined;
	const preview = (name: string | null) => props.onPreview?.(name);

	// Switching apps or windows mid-hover must not leave a theme on show.
	onMount(() => {
		const revert = () => preview(null);
		window.addEventListener("blur", revert);
		onCleanup(() => window.removeEventListener("blur", revert));
	});

	return (
		<div
			ref={grid}
			data-theme-grid
			class="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
			onPointerLeave={() => preview(null)}
			onFocusOut={(e) => {
				const next = e.relatedTarget as Node | null;
				if (!next || !grid?.contains(next)) preview(null);
			}}
		>
			<For each={themeNames}>
				{(name) => (
					<ThemeTile
						theme={themes[name]}
						active={props.currentTheme === name}
						featured={name === DEFAULT_THEME}
						onSelect={() => props.onSelect(name)}
						onPreview={() => preview(name)}
						onEscape={() => preview(null)}
					/>
				)}
			</For>
		</div>
	);
}
