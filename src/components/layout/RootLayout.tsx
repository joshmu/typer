import type { ParentProps } from "solid-js";

export default function RootLayout(props: ParentProps) {
	return (
		<div class="min-h-screen bg-bg text-text flex flex-col">
			<header class="flex items-center justify-between px-8 py-4">
				<a href="/" class="text-2xl font-bold text-primary no-underline">
					Typer
				</a>
				<nav class="flex gap-4">
					<a href="/" class="text-text-sub hover:text-text no-underline">
						Home
					</a>
					<a href="/about" class="text-text-sub hover:text-text no-underline">
						About
					</a>
				</nav>
			</header>
			{props.children}
		</div>
	);
}
