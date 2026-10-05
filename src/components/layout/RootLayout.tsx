import { useLocation } from "@solidjs/router";
import { For, type ParentProps } from "solid-js";
import { isTypingActive } from "@/lib/typing-focus";

const LINKS = [
	{ href: "/", label: "type" },
	{ href: "/library", label: "library" },
	{ href: "/game", label: "horde" },
] as const;

function GearIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			class="size-[18px]"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M10.3 3.6a1.7 1.7 0 0 1 3.4 0 1.7 1.7 0 0 0 2.6 1.1 1.7 1.7 0 0 1 2.4 2.4 1.7 1.7 0 0 0 1.1 2.6 1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1.1 2.6 1.7 1.7 0 0 1-2.4 2.4 1.7 1.7 0 0 0-2.6 1.1 1.7 1.7 0 0 1-3.4 0 1.7 1.7 0 0 0-2.6-1.1 1.7 1.7 0 0 1-2.4-2.4 1.7 1.7 0 0 0-1.1-2.6 1.7 1.7 0 0 1 0-3.4 1.7 1.7 0 0 0 1.1-2.6 1.7 1.7 0 0 1 2.4-2.4 1.7 1.7 0 0 0 2.6-1.1z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

export default function RootLayout(props: ParentProps) {
	const location = useLocation();
	const current = (href: string) =>
		location.pathname === href ? "page" : undefined;

	// the game arena is a black void behind a vignette — pure-black chrome on
	// /game lets the header/footer melt into it instead of framing it in grey
	const isGame = () => location.pathname === "/game";

	return (
		<div
			class="min-h-screen text-text flex flex-col"
			classList={{ "bg-black": isGame(), "bg-bg": !isGame() }}
		>
			<header
				class="flex items-center justify-between px-4 py-4 transition-opacity duration-500 sm:px-8"
				classList={{ "opacity-0 pointer-events-none": isTypingActive() }}
				inert={isTypingActive()}
			>
				<a
					href="/"
					class="font-display text-xl font-medium text-primary no-underline uppercase tracking-[0.15em]"
				>
					typer<span class="text-primary/50">_</span>
				</a>
				<nav
					aria-label="Main"
					class="flex items-center gap-5 font-display text-sm font-medium tracking-wide sm:gap-7"
				>
					<For each={LINKS}>
						{(link) => (
							<a
								href={link.href}
								class="nav-link no-underline"
								aria-current={current(link.href)}
							>
								{link.label}
							</a>
						)}
					</For>
					<span class="h-4 w-px bg-text-sub/25" aria-hidden="true" />
					<a
						href="/settings"
						class="nav-link nav-icon no-underline"
						aria-label="Settings"
						title="Settings"
						aria-current={current("/settings")}
					>
						<GearIcon />
					</a>
				</nav>
			</header>
			{props.children}
			<footer
				class="flex justify-center px-4 pt-2 pb-5 motion-safe:transition-opacity motion-safe:duration-500"
				classList={{
					hidden: isGame(),
					"opacity-0 pointer-events-none": isTypingActive(),
				}}
				inert={isTypingActive()}
			>
				<a
					href="/about"
					class="font-display text-xs tracking-wide text-text-sub/70 no-underline transition-colors hover:text-text"
					classList={{ "text-text": location.pathname === "/about" }}
					aria-current={current("/about")}
				>
					about
				</a>
			</footer>
		</div>
	);
}
