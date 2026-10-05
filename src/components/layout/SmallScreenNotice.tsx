import { createEffect, onCleanup, Show } from "solid-js";
import { usePreferences } from "@/lib/preferences-context";

/**
 * Under 640px, a one-time note that Typer wants a keyboard. CSS decides when
 * it shows; dismissing it is remembered.
 */
export default function SmallScreenNotice() {
	const [prefs, setPrefs] = usePreferences();
	// Room below the page while the note shows, so it covers nothing for good.
	createEffect(() => {
		const root = document.documentElement;
		root.toggleAttribute(
			"data-small-notice",
			!prefs.smallScreenNoticeDismissed,
		);
		onCleanup(() => root.removeAttribute("data-small-notice"));
	});
	return (
		<Show when={!prefs.smallScreenNoticeDismissed}>
			<div
				role="note"
				data-testid="small-screen-notice"
				class="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl bg-bg-secondary px-4 py-3 font-display text-sm text-text shadow-lg ring-1 ring-text/10 sm:hidden"
			>
				<svg
					viewBox="0 0 24 24"
					class="size-5 shrink-0 text-primary"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<rect x="2.5" y="6" width="19" height="12" rx="2" />
					<path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8" />
				</svg>
				<p class="flex-1 leading-snug">
					Typer is built for a keyboard; it works best on a wider screen.
				</p>
				<button
					type="button"
					aria-label="Dismiss"
					class="-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-text-sub outline-none transition-colors hover:bg-bg hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
					onClick={() => setPrefs("smallScreenNoticeDismissed", true)}
				>
					<svg
						viewBox="0 0 24 24"
						class="size-4"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M7 7l10 10M17 7L7 17" />
					</svg>
				</button>
			</div>
		</Show>
	);
}
