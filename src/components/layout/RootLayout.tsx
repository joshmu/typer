import type { ParentProps } from "solid-js";
import { isTypingActive } from "@/lib/typing-focus";

export default function RootLayout(props: ParentProps) {
	return (
		<div class="min-h-screen bg-bg text-text flex flex-col">
			<header
				class="flex items-center justify-between px-8 py-4 transition-opacity duration-500"
				classList={{ "opacity-0 pointer-events-none": isTypingActive() }}
			>
				<a
					href="/"
					class="font-display text-xl font-medium text-primary no-underline uppercase tracking-[0.15em]"
				>
					typer<span class="text-primary/50">_</span>
				</a>
				<nav class="flex gap-6 items-center font-display text-sm">
					<a
						href="/"
						class="nav-link text-text-sub hover:text-text no-underline"
					>
						Home
					</a>
					<a
						href="/settings"
						class="nav-link text-text-sub hover:text-text no-underline"
					>
						Settings
					</a>
				</nav>
			</header>
			{props.children}
		</div>
	);
}
