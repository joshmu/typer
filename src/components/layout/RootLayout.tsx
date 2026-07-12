import { useLocation } from "@solidjs/router";
import type { ParentProps } from "solid-js";
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

	// the game arena is a black void behind a vignette — pure-black chrome on
	// /game lets the header/footer melt into it instead of framing it in grey
	const isGame = () => location.pathname === "/game";

	return (
		<div
			class="min-h-screen text-text flex flex-col"
			classList={{ "bg-black": isGame(), "bg-bg": !isGame() }}
		>
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
