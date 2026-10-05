import { useLocation } from "@solidjs/router";
import type { ParentProps } from "solid-js";
import { isRunLive } from "@/lib/game-chrome";
import { isTypingActive } from "@/lib/typing-focus";

const LINKS = [
	{ href: "/", label: "Home" },
	{ href: "/game", label: "Game" },
	{ href: "/settings", label: "Settings" },
] as const;

export default function RootLayout(props: ParentProps) {
	const location = useLocation();
	const isActive = (href: string) =>
		href === "/" ? location.pathname === "/" : location.pathname === href;

	// /game is full-bleed: the header floats over the arena instead of taking
	// layout space, and steps away entirely while a run is live
	const isGame = () => location.pathname === "/game";
	const hidden = () => isTypingActive() || (isGame() && isRunLive());

	return (
		<div
			class="min-h-screen text-text flex flex-col"
			classList={{ "bg-black": isGame(), "bg-bg": !isGame() }}
		>
			<header
				class="flex items-center justify-between px-4 py-4 transition-[opacity,translate] duration-500 motion-reduce:transition-none sm:px-8"
				classList={{
					"opacity-0 pointer-events-none": hidden(),
					"-translate-y-3": isGame() && hidden(),
					"absolute inset-x-0 top-0 z-30": isGame(),
				}}
			>
				<a
					href="/"
					class="font-display text-xl font-medium text-primary no-underline uppercase tracking-[0.15em]"
				>
					typer<span class="text-primary/50">_</span>
				</a>
				<nav class="flex gap-6 items-center font-display text-sm font-medium">
					{LINKS.map((link) => (
						<a
							href={link.href}
							class="nav-link no-underline"
							classList={{
								"text-primary hover:text-primary/80": isActive(link.href),
								"text-text-sub hover:text-text": !isActive(link.href),
							}}
						>
							{link.label}
						</a>
					))}
				</nav>
			</header>
			{props.children}
		</div>
	);
}
