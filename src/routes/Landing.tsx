import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ── Design Tokens (Midnight Luxe) ──────────────────────────────────
const PALETTE = {
	obsidian: "#0D0D12",
	champagne: "#C9A84C",
	ivory: "#FAF8F5",
	slate: "#2A2A35",
	slateLight: "#3A3A48",
	champagneGlow: "rgba(201, 168, 76, 0.15)",
};

// ── Hero Unsplash Image ────────────────────────────────────────────
const HERO_IMAGE =
	"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=80&auto=format&fit=crop";
const PHILOSOPHY_IMAGE =
	"https://images.unsplash.com/photo-1545239351-ef35f43d514b?w=1920&q=80&auto=format&fit=crop";

// ── Navbar ─────────────────────────────────────────────────────────
function Navbar() {
	const [scrolled, setScrolled] = createSignal(false);

	onMount(() => {
		const onScroll = () => setScrolled(window.scrollY > 100);
		window.addEventListener("scroll", onScroll, { passive: true });
		onCleanup(() => window.removeEventListener("scroll", onScroll));
	});

	return (
		<nav
			class="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-8 px-8 py-3 transition-all duration-500"
			style={{
				"border-radius": "9999px",
				background: scrolled()
					? "rgba(250, 248, 245, 0.08)"
					: "transparent",
				"backdrop-filter": scrolled() ? "blur(24px)" : "none",
				"-webkit-backdrop-filter": scrolled() ? "blur(24px)" : "none",
				border: scrolled()
					? "1px solid rgba(250, 248, 245, 0.1)"
					: "1px solid transparent",
			}}
		>
			<a
				href="/"
				class="font-bold text-lg tracking-tight no-underline"
				style={{
					"font-family": "'Inter', sans-serif",
					color: PALETTE.ivory,
				}}
			>
				typer<span style={{ color: PALETTE.champagne, opacity: 0.6 }}>_</span>
			</a>
			<div class="hidden md:flex items-center gap-6">
				<For each={["Features", "Philosophy", "Process"]}>
					{(item) => (
						<a
							href={`#${item.toLowerCase()}`}
							class="text-sm no-underline transition-all duration-200 hover:-translate-y-px"
							style={{
								"font-family": "'Inter', sans-serif",
								color: `${PALETTE.ivory}99`,
							}}
							onMouseOver={(e) => {
								e.currentTarget.style.color = PALETTE.ivory;
							}}
							onMouseOut={(e) => {
								e.currentTarget.style.color = `${PALETTE.ivory}99`;
							}}
							onFocus={(e) => {
								e.currentTarget.style.color = PALETTE.ivory;
							}}
							onBlur={(e) => {
								e.currentTarget.style.color = `${PALETTE.ivory}99`;
							}}
						>
							{item}
						</a>
					)}
				</For>
			</div>
			<a
				href="/app"
				class="text-sm font-semibold no-underline px-5 py-2 overflow-hidden relative transition-transform duration-300 hover:scale-103"
				style={{
					"font-family": "'Inter', sans-serif",
					background: PALETTE.champagne,
					color: PALETTE.obsidian,
					"border-radius": "9999px",
				}}
			>
				Enter the flow
			</a>
		</nav>
	);
}

// ── Hero Section ───────────────────────────────────────────────────
function HeroSection() {
	let sectionRef!: HTMLElement;

	onMount(() => {
		const ctx = gsap.context(() => {
			gsap.from("[data-hero-anim]", {
				y: 40,
				opacity: 0,
				duration: 1,
				ease: "power3.out",
				stagger: 0.08,
				delay: 0.3,
			});
		}, sectionRef);
		onCleanup(() => ctx.revert());
	});

	return (
		<section
			ref={sectionRef}
			class="relative w-full flex items-end overflow-hidden"
			style={{ height: "100dvh" }}
		>
			{/* Background image */}
			<div
				class="absolute inset-0 bg-cover bg-center"
				style={{
					"background-image": `url('${HERO_IMAGE}')`,
				}}
			/>
			{/* Gradient overlay */}
			<div
				class="absolute inset-0"
				style={{
					background: `linear-gradient(to top, ${PALETTE.obsidian} 0%, ${PALETTE.obsidian}E6 30%, ${PALETTE.obsidian}80 60%, transparent 100%)`,
				}}
			/>

			{/* Content */}
			<div class="relative z-10 w-full max-w-7xl mx-auto px-8 pb-24 md:pb-32">
				<h1 data-hero-anim class="m-0 leading-none">
					<span
						class="block text-3xl md:text-5xl font-bold tracking-tight"
						style={{
							"font-family": "'Inter', sans-serif",
							color: PALETTE.ivory,
						}}
					>
						Precision meets
					</span>
					<span
						class="block mt-2 md:mt-4"
						style={{
							"font-family": "'Playfair Display', serif",
							"font-style": "italic",
							"font-size": "clamp(4rem, 12vw, 10rem)",
							color: PALETTE.champagne,
							"line-height": "0.95",
						}}
					>
						Mastery.
					</span>
				</h1>
				<p
					data-hero-anim
					class="mt-6 md:mt-8 max-w-xl text-base md:text-lg"
					style={{
						"font-family": "'Inter', sans-serif",
						color: `${PALETTE.ivory}99`,
						"line-height": "1.6",
					}}
				>
					Master your keyboard with real-time feedback, precision analytics,
					and the world's greatest literature at your fingertips.
				</p>
				<a
					data-hero-anim
					href="/app"
					class="inline-block mt-8 px-8 py-4 text-base font-semibold no-underline transition-transform duration-300 hover:scale-103"
					style={{
						"font-family": "'Inter', sans-serif",
						background: PALETTE.champagne,
						color: PALETTE.obsidian,
						"border-radius": "2rem",
					}}
				>
					Enter the flow
				</a>
			</div>
		</section>
	);
}

// ── Feature Cards ──────────────────────────────────────────────────

// Card 1: Diagnostic Shuffler (Speed)
function ShufflerCard() {
	const labels = ["Real-time WPM", "Live Feedback", "Speed Metrics"];
	const [order, setOrder] = createSignal([0, 1, 2]);

	onMount(() => {
		const interval = setInterval(() => {
			setOrder((prev) => {
				const next = [...prev];
				next.unshift(next.pop()!);
				return next;
			});
		}, 3000);
		onCleanup(() => clearInterval(interval));
	});

	return (
		<div
			class="p-8 flex flex-col"
			style={{
				background: PALETTE.ivory,
				"border-radius": "2rem",
				border: `1px solid ${PALETTE.slate}15`,
				"box-shadow": "0 4px 40px rgba(0,0,0,0.08)",
			}}
		>
			<h3
				class="text-xl font-bold m-0 mb-2"
				style={{
					"font-family": "'Inter', sans-serif",
					color: PALETTE.obsidian,
				}}
			>
				Speed
			</h3>
			<p
				class="text-sm m-0 mb-6"
				style={{
					"font-family": "'Inter', sans-serif",
					color: PALETTE.slate,
				}}
			>
				Real-time WPM tracking with instant visual feedback on every keystroke.
			</p>
			{/* Shuffling cards */}
			<div class="relative h-40 flex items-center justify-center">
				<For each={order()}>
					{(idx, i) => (
						<div
							class="absolute w-52 px-5 py-4 text-center transition-all"
							style={{
								background:
									i() === 0
										? PALETTE.champagne
										: i() === 1
											? `${PALETTE.champagne}33`
											: `${PALETTE.champagne}15`,
								"border-radius": "1.5rem",
								color: i() === 0 ? PALETTE.obsidian : PALETTE.slate,
								"font-family": "'JetBrains Mono', monospace",
								"font-size": "0.85rem",
								"font-weight": i() === 0 ? "700" : "400",
								transform: `translateY(${i() * 16}px) scale(${1 - i() * 0.05})`,
								"z-index": 3 - i(),
								"transition-duration": "600ms",
								"transition-timing-function":
									"cubic-bezier(0.34, 1.56, 0.64, 1)",
								"box-shadow":
									i() === 0 ? "0 8px 24px rgba(201,168,76,0.3)" : "none",
							}}
						>
							{labels[idx]}
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

// Card 2: Telemetry Typewriter (Precision)
function TypewriterCard() {
	const messages = [
		"Accuracy: 98.7% | Errors: 3 | Consistency: 94.2%",
		"WPM: 87 → 92 (+5.7%) improvement detected",
		"Error pattern: 'th' → 'ht' transposition flagged",
		"Session #47: personal best streak — 312 chars",
		"Consistency score rising: 91.3% → 94.2%",
	];
	const [currentMsg, setCurrentMsg] = createSignal("");
	const [msgIdx, setMsgIdx] = createSignal(0);

	onMount(() => {
		let charIdx = 0;
		let typing = true;

		const tick = () => {
			if (typing) {
				const fullMsg = messages[msgIdx()];
				if (charIdx <= fullMsg.length) {
					setCurrentMsg(fullMsg.slice(0, charIdx));
					charIdx++;
				} else {
					typing = false;
					setTimeout(() => {
						charIdx = 0;
						setMsgIdx((prev) => (prev + 1) % messages.length);
						typing = true;
					}, 2000);
				}
			}
		};

		const interval = setInterval(tick, 45);
		onCleanup(() => clearInterval(interval));
	});

	return (
		<div
			class="p-8 flex flex-col"
			style={{
				background: PALETTE.ivory,
				"border-radius": "2rem",
				border: `1px solid ${PALETTE.slate}15`,
				"box-shadow": "0 4px 40px rgba(0,0,0,0.08)",
			}}
		>
			<h3
				class="text-xl font-bold m-0 mb-2"
				style={{
					"font-family": "'Inter', sans-serif",
					color: PALETTE.obsidian,
				}}
			>
				Precision
			</h3>
			<p
				class="text-sm m-0 mb-6"
				style={{
					"font-family": "'Inter', sans-serif",
					color: PALETTE.slate,
				}}
			>
				Deep accuracy analysis — every error pattern, every improvement tracked.
			</p>
			{/* Live feed */}
			<div
				class="px-5 py-4"
				style={{
					background: PALETTE.obsidian,
					"border-radius": "1rem",
				}}
			>
				<div class="flex items-center gap-2 mb-3">
					<div
						class="w-2 h-2 rounded-full animate-pulse"
						style={{ background: "#4ade80" }}
					/>
					<span
						class="text-xs uppercase tracking-widest"
						style={{
							"font-family": "'JetBrains Mono', monospace",
							color: `${PALETTE.ivory}66`,
						}}
					>
						Live Feed
					</span>
				</div>
				<div
					class="min-h-[3rem]"
					style={{
						"font-family": "'JetBrains Mono', monospace",
						"font-size": "0.8rem",
						color: PALETTE.ivory,
						"line-height": "1.6",
					}}
				>
					{currentMsg()}
					<span
						class="inline-block w-0.5 h-4 ml-0.5 align-middle animate-blink"
						style={{ background: PALETTE.champagne }}
					/>
				</div>
			</div>
		</div>
	);
}

// Card 3: Cursor Protocol Scheduler (Literature)
function SchedulerCard() {
	const days = ["S", "M", "T", "W", "T", "F", "S"];
	const [activeDay, setActiveDay] = createSignal(-1);
	const [cursorPos, setCursorPos] = createSignal({ x: 0, y: 0 });
	const [showCursor, setShowCursor] = createSignal(false);
	const [saved, setSaved] = createSignal(false);
	const activatedDays = new Set<number>();

	onMount(() => {
		const sequence = [1, 3, 5]; // Mon, Wed, Fri
		let step = 0;

		const runAnimation = () => {
			if (step < sequence.length) {
				const dayIdx = sequence[step];
				setShowCursor(true);

				// Move cursor to day cell
				const cellX = 24 + dayIdx * 40;
				const cellY = 20;
				setCursorPos({ x: cellX, y: cellY });

				setTimeout(() => {
					setActiveDay(dayIdx);
					activatedDays.add(dayIdx);
					step++;
					setTimeout(runAnimation, 800);
				}, 600);
			} else {
				// Move to Save button
				setCursorPos({ x: 120, y: 70 });
				setTimeout(() => {
					setSaved(true);
					setTimeout(() => {
						setShowCursor(false);
					}, 500);
				}, 600);

				// Reset after pause
				setTimeout(() => {
					step = 0;
					activatedDays.clear();
					setActiveDay(-1);
					setSaved(false);
					runAnimation();
				}, 4000);
			}
		};

		const timeout = setTimeout(runAnimation, 1000);
		onCleanup(() => clearTimeout(timeout));
	});

	return (
		<div
			class="p-8 flex flex-col"
			style={{
				background: PALETTE.ivory,
				"border-radius": "2rem",
				border: `1px solid ${PALETTE.slate}15`,
				"box-shadow": "0 4px 40px rgba(0,0,0,0.08)",
			}}
		>
			<h3
				class="text-xl font-bold m-0 mb-2"
				style={{
					"font-family": "'Inter', sans-serif",
					color: PALETTE.obsidian,
				}}
			>
				Literature
			</h3>
			<p
				class="text-sm m-0 mb-6"
				style={{
					"font-family": "'Inter', sans-serif",
					color: PALETTE.slate,
				}}
			>
				Type through classic books — practice with the world's greatest prose.
			</p>
			{/* Weekly grid */}
			<div class="relative">
				<div class="flex gap-2 mb-4">
					<For each={days}>
						{(day, i) => (
							<div
								class="w-9 h-9 flex items-center justify-center text-xs font-medium transition-all duration-300"
								style={{
									"font-family": "'Inter', sans-serif",
									"border-radius": "0.75rem",
									background:
										activatedDays.has(i()) || activeDay() === i()
											? PALETTE.champagne
											: `${PALETTE.slate}15`,
									color:
										activatedDays.has(i()) || activeDay() === i()
											? PALETTE.obsidian
											: PALETTE.slate,
									transform:
										activeDay() === i() ? "scale(0.95)" : "scale(1)",
								}}
							>
								{day}
							</div>
						)}
					</For>
				</div>
				{/* Save button */}
				<div
					class="text-xs font-semibold px-4 py-2 inline-block transition-all duration-300"
					style={{
						"font-family": "'Inter', sans-serif",
						background: saved() ? PALETTE.champagne : `${PALETTE.slate}15`,
						color: saved() ? PALETTE.obsidian : PALETTE.slate,
						"border-radius": "0.75rem",
					}}
				>
					{saved() ? "Saved!" : "Save Schedule"}
				</div>

				{/* Animated cursor */}
				<Show when={showCursor()}>
					<svg
						role="img"
						aria-label="Animated cursor"
						class="absolute pointer-events-none transition-all duration-500 ease-out"
						style={{
							left: `${cursorPos().x}px`,
							top: `${cursorPos().y}px`,
							width: "20px",
							height: "20px",
						}}
						viewBox="0 0 24 24"
						fill="none"
					>
						<path
							d="M5 3L19 12L12 13L9 20L5 3Z"
							fill={PALETTE.champagne}
							stroke={PALETTE.obsidian}
							stroke-width="1.5"
						/>
					</svg>
				</Show>
			</div>
		</div>
	);
}

function FeaturesSection() {
	let sectionRef!: HTMLElement;

	onMount(() => {
		const ctx = gsap.context(() => {
			gsap.from("[data-feature-card]", {
				y: 60,
				opacity: 0,
				duration: 0.8,
				ease: "power3.out",
				stagger: 0.15,
				scrollTrigger: {
					trigger: sectionRef,
					start: "top 75%",
				},
			});
		}, sectionRef);
		onCleanup(() => ctx.revert());
	});

	return (
		<section
			ref={sectionRef}
			id="features"
			class="relative py-24 md:py-32 px-8"
			style={{ background: PALETTE.obsidian }}
		>
			<div class="max-w-7xl mx-auto">
				<div class="mb-16">
					<span
						class="text-xs uppercase tracking-widest"
						style={{
							"font-family": "'JetBrains Mono', monospace",
							color: PALETTE.champagne,
						}}
					>
						Why Typer
					</span>
					<h2
						class="text-3xl md:text-5xl font-bold mt-4 m-0"
						style={{
							"font-family": "'Inter', sans-serif",
							color: PALETTE.ivory,
							"letter-spacing": "-0.02em",
						}}
					>
						Three pillars of
						<span
							class="block"
							style={{
								"font-family": "'Playfair Display', serif",
								"font-style": "italic",
								color: PALETTE.champagne,
							}}
						>
							keyboard mastery.
						</span>
					</h2>
				</div>
				<div class="grid md:grid-cols-3 gap-6">
					<div data-feature-card>
						<ShufflerCard />
					</div>
					<div data-feature-card>
						<TypewriterCard />
					</div>
					<div data-feature-card>
						<SchedulerCard />
					</div>
				</div>
			</div>
		</section>
	);
}

// ── Philosophy Section ─────────────────────────────────────────────
function PhilosophySection() {
	let sectionRef!: HTMLElement;

	onMount(() => {
		const ctx = gsap.context(() => {
			gsap.from("[data-philosophy-line]", {
				y: 30,
				opacity: 0,
				duration: 0.8,
				ease: "power3.out",
				stagger: 0.08,
				scrollTrigger: {
					trigger: sectionRef,
					start: "top 60%",
				},
			});
		}, sectionRef);
		onCleanup(() => ctx.revert());
	});

	return (
		<section
			ref={sectionRef}
			id="philosophy"
			class="relative py-32 md:py-48 px-8 overflow-hidden"
			style={{ background: PALETTE.slate }}
		>
			{/* Parallax background image */}
			<div
				class="absolute inset-0 bg-cover bg-center opacity-10"
				style={{
					"background-image": `url('${PHILOSOPHY_IMAGE}')`,
				}}
			/>
			<div class="relative z-10 max-w-5xl mx-auto">
				<p
					data-philosophy-line
					class="text-lg md:text-2xl m-0 mb-8"
					style={{
						"font-family": "'Inter', sans-serif",
						color: `${PALETTE.ivory}88`,
						"line-height": "1.5",
					}}
				>
					Most typing tools focus on: speed tests and leaderboards. Gamified
					distractions that measure performance without building skill.
				</p>
				<p data-philosophy-line class="m-0">
					<span
						class="block text-3xl md:text-6xl font-bold"
						style={{
							"font-family": "'Playfair Display', serif",
							"font-style": "italic",
							color: PALETTE.ivory,
							"line-height": "1.15",
						}}
					>
						We focus on: the craft of{" "}
						<span style={{ color: PALETTE.champagne }}>mastery</span>.
					</span>
				</p>
				<p
					data-philosophy-line
					class="mt-8 text-base md:text-lg max-w-2xl"
					style={{
						"font-family": "'Inter', sans-serif",
						color: `${PALETTE.ivory}77`,
						"line-height": "1.7",
					}}
				>
					Deliberate practice through literature. Precision analytics that
					reveal your patterns. A distraction-free environment that lets you
					enter a state of flow.
				</p>
			</div>
		</section>
	);
}

// ── Protocol Section (Sticky Stacking) ─────────────────────────────
function ProtocolSection() {
	let sectionRef!: HTMLDivElement;
	let cardsContainerRef!: HTMLDivElement;

	const steps = [
		{
			num: "01",
			title: "Choose your mode",
			desc: "Timed tests, word counts, curated quotes, zen mode, or full classic books. Every session tailored to how you want to practice.",
		},
		{
			num: "02",
			title: "Enter the flow",
			desc: "A distraction-free interface with a precision caret, real-time metrics, and typographic clarity that lets you focus on nothing but the next keystroke.",
		},
		{
			num: "03",
			title: "Master the craft",
			desc: "Track WPM trends, identify error patterns, and watch your consistency improve session over session with detailed analytics.",
		},
	];

	onMount(() => {
		const ctx = gsap.context(() => {
			const cards =
				cardsContainerRef.querySelectorAll("[data-protocol-card]");

			cards.forEach((card, i) => {
				if (i < cards.length - 1) {
					ScrollTrigger.create({
						trigger: card,
						start: "top 10%",
						end: "bottom 10%",
						onUpdate: (self) => {
							const progress = self.progress;
							gsap.set(card, {
								scale: 1 - progress * 0.1,
								filter: `blur(${progress * 20}px)`,
								opacity: 1 - progress * 0.5,
							});
						},
					});
				}

				// Entrance animation
				gsap.from(card, {
					y: 80,
					opacity: 0,
					duration: 0.8,
					ease: "power3.out",
					scrollTrigger: {
						trigger: card,
						start: "top 80%",
					},
				});
			});
		}, sectionRef);
		onCleanup(() => ctx.revert());
	});

	return (
		<section
			ref={sectionRef}
			id="process"
			class="relative py-24 md:py-32 px-8"
			style={{ background: PALETTE.obsidian }}
		>
			<div class="max-w-7xl mx-auto">
				<div class="mb-16">
					<span
						class="text-xs uppercase tracking-widest"
						style={{
							"font-family": "'JetBrains Mono', monospace",
							color: PALETTE.champagne,
						}}
					>
						The Process
					</span>
					<h2
						class="text-3xl md:text-5xl font-bold mt-4 m-0"
						style={{
							"font-family": "'Inter', sans-serif",
							color: PALETTE.ivory,
							"letter-spacing": "-0.02em",
						}}
					>
						Three steps to{" "}
						<span
							style={{
								"font-family": "'Playfair Display', serif",
								"font-style": "italic",
								color: PALETTE.champagne,
							}}
						>
							flow state.
						</span>
					</h2>
				</div>

				<div ref={cardsContainerRef} class="flex flex-col gap-8">
					<For each={steps}>
						{(step) => (
							<div
								data-protocol-card
								class="relative p-10 md:p-14 overflow-hidden"
								style={{
									background: PALETTE.slate,
									"border-radius": "2.5rem",
									border: `1px solid ${PALETTE.ivory}10`,
								}}
							>
								{/* SVG animation background */}
								<ProtocolCardAnimation num={step.num} />

								<div class="relative z-10">
									<span
										class="text-sm"
										style={{
											"font-family": "'JetBrains Mono', monospace",
											color: PALETTE.champagne,
										}}
									>
										{step.num}
									</span>
									<h3
										class="text-2xl md:text-4xl font-bold mt-3 mb-4 m-0"
										style={{
											"font-family": "'Inter', sans-serif",
											color: PALETTE.ivory,
											"letter-spacing": "-0.02em",
										}}
									>
										{step.title}
									</h3>
									<p
										class="text-base md:text-lg m-0 max-w-xl"
										style={{
											"font-family": "'Inter', sans-serif",
											color: `${PALETTE.ivory}88`,
											"line-height": "1.6",
										}}
									>
										{step.desc}
									</p>
								</div>
							</div>
						)}
					</For>
				</div>
			</div>
		</section>
	);
}

// Per-card SVG animations
function ProtocolCardAnimation(props: { num: string }) {
	let svgRef!: SVGSVGElement;

	onMount(() => {
		const ctx = gsap.context(() => {
			if (props.num === "01") {
				// Rotating geometric motif
				const el = svgRef.querySelector("[data-rotate]");
				if (el) {
					gsap.to(el, {
						rotation: 360,
						duration: 30,
						repeat: -1,
						ease: "none",
						transformOrigin: "center center",
					});
				}
			} else if (props.num === "02") {
				// Scanning laser line
				const el = svgRef.querySelector("[data-scan]");
				if (el) {
					gsap.to(el, {
						attr: { y1: 200, y2: 200 },
						duration: 3,
						repeat: -1,
						yoyo: true,
						ease: "power2.inOut",
					});
				}
			} else if (props.num === "03") {
				// Pulsing waveform
				const el = svgRef.querySelector("[data-wave]");
				if (el) {
					gsap.to(el, {
						strokeDashoffset: 0,
						duration: 2,
						repeat: -1,
						ease: "none",
					});
				}
			}
		}, svgRef);
		onCleanup(() => ctx.revert());
	});

	return (
		<svg
			ref={svgRef}
			role="img"
			aria-label="Decorative animation"
			class="absolute right-0 top-0 w-64 h-64 md:w-80 md:h-80 opacity-10"
			viewBox="0 0 200 200"
			fill="none"
		>
			<Show when={props.num === "01"}>
				<g data-rotate>
					<circle
						cx="100"
						cy="100"
						r="60"
						stroke={PALETTE.champagne}
						stroke-width="0.5"
					/>
					<circle
						cx="100"
						cy="100"
						r="80"
						stroke={PALETTE.champagne}
						stroke-width="0.5"
					/>
					<circle
						cx="100"
						cy="100"
						r="40"
						stroke={PALETTE.champagne}
						stroke-width="0.5"
					/>
					<line
						x1="100"
						y1="20"
						x2="100"
						y2="180"
						stroke={PALETTE.champagne}
						stroke-width="0.5"
					/>
					<line
						x1="20"
						y1="100"
						x2="180"
						y2="100"
						stroke={PALETTE.champagne}
						stroke-width="0.5"
					/>
				</g>
			</Show>
			<Show when={props.num === "02"}>
				<g>
					{/* Grid dots */}
					<For each={Array.from({ length: 100 })}>
						{(_, i) => (
							<circle
								cx={20 + (i() % 10) * 18}
								cy={20 + Math.floor(i() / 10) * 18}
								r="1"
								fill={PALETTE.champagne}
							/>
						)}
					</For>
					<line
						data-scan
						x1="0"
						y1="0"
						x2="200"
						y2="0"
						stroke={PALETTE.champagne}
						stroke-width="1"
						opacity="0.6"
					/>
				</g>
			</Show>
			<Show when={props.num === "03"}>
				<path
					data-wave
					d="M0,100 Q25,60 50,100 T100,100 T150,100 T200,100"
					stroke={PALETTE.champagne}
					stroke-width="1.5"
					stroke-dasharray="400"
					stroke-dashoffset="400"
				/>
			</Show>
		</svg>
	);
}

// ── Get Started / CTA Section ──────────────────────────────────────
function CTASection() {
	let sectionRef!: HTMLElement;

	onMount(() => {
		const ctx = gsap.context(() => {
			gsap.from("[data-cta-anim]", {
				y: 40,
				opacity: 0,
				duration: 0.8,
				ease: "power3.out",
				stagger: 0.1,
				scrollTrigger: {
					trigger: sectionRef,
					start: "top 70%",
				},
			});
		}, sectionRef);
		onCleanup(() => ctx.revert());
	});

	return (
		<section
			ref={sectionRef}
			class="relative py-32 md:py-48 px-8"
			style={{ background: PALETTE.obsidian }}
		>
			<div class="max-w-4xl mx-auto text-center">
				<h2
					data-cta-anim
					class="text-4xl md:text-7xl font-bold m-0"
					style={{
						"font-family": "'Inter', sans-serif",
						color: PALETTE.ivory,
						"letter-spacing": "-0.03em",
					}}
				>
					Ready to master
					<span
						class="block mt-2"
						style={{
							"font-family": "'Playfair Display', serif",
							"font-style": "italic",
							color: PALETTE.champagne,
						}}
					>
						your keyboard?
					</span>
				</h2>
				<p
					data-cta-anim
					class="mt-6 text-lg"
					style={{
						"font-family": "'Inter', sans-serif",
						color: `${PALETTE.ivory}77`,
					}}
				>
					No sign-up required. No distractions. Just you and the keys.
				</p>
				<a
					data-cta-anim
					href="/app"
					class="inline-block mt-10 px-10 py-5 text-lg font-semibold no-underline transition-transform duration-300 hover:scale-103"
					style={{
						"font-family": "'Inter', sans-serif",
						background: PALETTE.champagne,
						color: PALETTE.obsidian,
						"border-radius": "2rem",
						"box-shadow": `0 0 60px ${PALETTE.champagneGlow}`,
					}}
				>
					Enter the flow
				</a>
			</div>
		</section>
	);
}

// ── Footer ─────────────────────────────────────────────────────────
function Footer() {
	return (
		<footer
			class="relative px-8 pt-16 pb-8"
			style={{
				background: PALETTE.obsidian,
				"border-top": `1px solid ${PALETTE.ivory}08`,
				"border-radius": "4rem 4rem 0 0",
			}}
		>
			<div class="max-w-7xl mx-auto">
				<div class="grid md:grid-cols-4 gap-12 mb-16">
					{/* Brand */}
					<div class="md:col-span-2">
						<span
							class="text-2xl font-bold"
							style={{
								"font-family": "'Inter', sans-serif",
								color: PALETTE.ivory,
							}}
						>
							typer
							<span style={{ color: PALETTE.champagne, opacity: 0.6 }}>_</span>
						</span>
						<p
							class="mt-3 text-sm max-w-xs"
							style={{
								"font-family": "'Inter', sans-serif",
								color: `${PALETTE.ivory}66`,
								"line-height": "1.6",
							}}
						>
							Master your keyboard. Precision typing practice with real-time
							analytics and classic literature.
						</p>
					</div>
					{/* Nav */}
					<div>
						<h4
							class="text-xs uppercase tracking-widest mb-4 m-0"
							style={{
								"font-family": "'JetBrains Mono', monospace",
								color: `${PALETTE.ivory}44`,
							}}
						>
							Navigate
						</h4>
						<div class="flex flex-col gap-3">
							<For each={["Features", "Philosophy", "Process"]}>
								{(item) => (
									<a
										href={`#${item.toLowerCase()}`}
										class="text-sm no-underline transition-colors duration-200"
										style={{
											"font-family": "'Inter', sans-serif",
											color: `${PALETTE.ivory}88`,
										}}
										onMouseOver={(e) => {
											e.currentTarget.style.color = PALETTE.ivory;
										}}
										onMouseOut={(e) => {
											e.currentTarget.style.color = `${PALETTE.ivory}88`;
										}}
										onFocus={(e) => {
											e.currentTarget.style.color = PALETTE.ivory;
										}}
										onBlur={(e) => {
											e.currentTarget.style.color = `${PALETTE.ivory}88`;
										}}
									>
										{item}
									</a>
								)}
							</For>
						</div>
					</div>
					{/* Links */}
					<div>
						<h4
							class="text-xs uppercase tracking-widest mb-4 m-0"
							style={{
								"font-family": "'JetBrains Mono', monospace",
								color: `${PALETTE.ivory}44`,
							}}
						>
							Product
						</h4>
						<div class="flex flex-col gap-3">
							<a
								href="/app"
								class="text-sm no-underline transition-colors duration-200"
								style={{
									"font-family": "'Inter', sans-serif",
									color: `${PALETTE.ivory}88`,
								}}
								onMouseOver={(e) => {
									e.currentTarget.style.color = PALETTE.ivory;
								}}
								onMouseOut={(e) => {
									e.currentTarget.style.color = `${PALETTE.ivory}88`;
								}}
								onFocus={(e) => {
									e.currentTarget.style.color = PALETTE.ivory;
								}}
								onBlur={(e) => {
									e.currentTarget.style.color = `${PALETTE.ivory}88`;
								}}
							>
								Start Typing
							</a>
							<a
								href="/settings"
								class="text-sm no-underline transition-colors duration-200"
								style={{
									"font-family": "'Inter', sans-serif",
									color: `${PALETTE.ivory}88`,
								}}
								onMouseOver={(e) => {
									e.currentTarget.style.color = PALETTE.ivory;
								}}
								onMouseOut={(e) => {
									e.currentTarget.style.color = `${PALETTE.ivory}88`;
								}}
								onFocus={(e) => {
									e.currentTarget.style.color = PALETTE.ivory;
								}}
								onBlur={(e) => {
									e.currentTarget.style.color = `${PALETTE.ivory}88`;
								}}
							>
								Settings
							</a>
						</div>
					</div>
				</div>
				{/* Bottom bar */}
				<div
					class="flex flex-col md:flex-row items-center justify-between pt-8"
					style={{
						"border-top": `1px solid ${PALETTE.ivory}10`,
					}}
				>
					<span
						class="text-xs"
						style={{
							"font-family": "'Inter', sans-serif",
							color: `${PALETTE.ivory}44`,
						}}
					>
						&copy; {new Date().getFullYear()} Typer. Built for keyboard
						enthusiasts.
					</span>
					{/* System Operational */}
					<div class="flex items-center gap-2 mt-4 md:mt-0">
						<div
							class="w-1.5 h-1.5 rounded-full animate-pulse"
							style={{ background: "#4ade80" }}
						/>
						<span
							class="text-xs"
							style={{
								"font-family": "'JetBrains Mono', monospace",
								color: `${PALETTE.ivory}44`,
							}}
						>
							System Operational
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
}

// ── Main Landing Page ──────────────────────────────────────────────
export default function Landing() {
	onCleanup(() => {
		for (const t of ScrollTrigger.getAll()) t.kill();
	});

	return (
		<div style={{ background: PALETTE.obsidian }}>
			<Navbar />
			<HeroSection />
			<FeaturesSection />
			<PhilosophySection />
			<ProtocolSection />
			<CTASection />
			<Footer />
		</div>
	);
}
