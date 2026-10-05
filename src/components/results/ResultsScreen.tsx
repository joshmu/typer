import { animate, spring, stagger } from "motion";
import {
	createSignal,
	type JSX,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
} from "solid-js";
import {
	type CharBreakdown,
	comparePersonalBest,
	type PersonalBestOutcome,
} from "@/lib/core/calc";
import { findPreviousBest } from "@/lib/queries";
import { latestResultInsights } from "@/lib/result-insights";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";
import { copyResultImage } from "./copy-image";
import HistoryList from "./HistoryList";
import { modeLabel } from "./mode-label";
import WPMChart from "./WPMChart";

interface ResultsScreenProps {
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	breakdown: CharBreakdown;
	elapsed: number;
	wpmPerSecond: number[];
	onRedo: () => void;
	redoLabel?: string;
	/** The result could not be recorded to history. */
	saveFailed?: boolean;
}

/** Reveal timeline, in seconds from mount. */
const COUNT_S = 1.1;
const STATS_AT = 0.25;
const PANEL_AT = 0.35;
const CHARS_AT = 0.55;
const ACTIONS_AT = 0.7;
const CHART_AT = COUNT_S;
/** History mounts once the chart has drawn, off the animation's frames. */
const HISTORY_AFTER_MS = 1900;

function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

function StatCell(props: {
	label: string;
	value: string;
	sub?: string;
	hidden: string;
}) {
	return (
		<div
			class={`stat-cell flex flex-col items-center gap-1 py-1 sm:border-l sm:first:border-l-0 border-text-sub/15 ${props.hidden}`}
		>
			<span class="font-display text-[11px] uppercase tracking-[0.2em] text-text-sub">
				{props.label}
			</span>
			<span
				class="font-display text-3xl font-bold text-text tabular-nums leading-tight"
				data-testid={`stat-${props.label}`}
			>
				{props.value}
				{props.sub && (
					<span class="text-lg text-text-sub font-normal">{props.sub}</span>
				)}
			</span>
		</div>
	);
}

function BreakdownItem(props: {
	label: string;
	count: number;
	dot: string;
	hidden: string;
}) {
	return (
		<div
			class={`breakdown-item flex items-center justify-center gap-2 font-display text-sm ${props.hidden}`}
		>
			<span class={`h-2 w-2 shrink-0 rounded-full ${props.dot}`} />
			<span class="text-text-sub">{props.label}</span>
			<span
				class="breakdown-count font-display font-bold text-text tabular-nums"
				data-count={props.count}
			>
				{props.count}
			</span>
		</div>
	);
}

function Chip(props: { tone: "primary" | "muted"; children: JSX.Element }) {
	return (
		<span
			class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-sm font-semibold tabular-nums"
			classList={{
				"bg-primary/15 text-primary ring-1 ring-primary/40":
					props.tone === "primary",
				"bg-text-sub/10 text-text-sub": props.tone === "muted",
			}}
		>
			{props.children}
		</span>
	);
}

const COPY_LABELS = {
	idle: "Copy image",
	busy: "Rendering…",
	copied: "Copied",
	downloaded: "Saved PNG",
	failed: "Couldn't copy",
} as const;

export default function ResultsScreen(props: ResultsScreenProps) {
	let containerRef!: HTMLDivElement;
	let heroRef!: HTMLSpanElement;
	let heroWrap!: HTMLDivElement;
	let glowRef!: HTMLDivElement;
	let chipRef!: HTMLDivElement;
	let redoRef!: HTMLButtonElement;

	const reduced = prefersReducedMotion();
	const insights = latestResultInsights();
	const afk = insights?.afk ?? false;
	const [pb, setPb] = createSignal<PersonalBestOutcome | null>(
		afk ? { kind: "afk" } : null,
	);
	const [showHistory, setShowHistory] = createSignal(false);
	const [copyState, setCopyState] =
		createSignal<keyof typeof COPY_LABELS>("idle");

	// With nothing focused, Tab lands on Redo so Tab then Enter restarts.
	// Once something has focus, Tab moves on as usual.
	const focusRedoOnTab = (e: KeyboardEvent) => {
		const focused = document.activeElement;
		if (e.key !== "Tab" || e.shiftKey) return;
		if (focused && focused !== document.body) return;
		e.preventDefault();
		redoRef.focus();
	};
	window.addEventListener("keydown", focusRedoOnTab);
	onCleanup(() => window.removeEventListener("keydown", focusRedoOnTab));

	const timers: ReturnType<typeof setTimeout>[] = [];
	const later = (ms: number, fn: () => void) => {
		timers.push(setTimeout(fn, ms));
	};
	onCleanup(() => {
		for (const t of timers) clearTimeout(t);
	});

	// The burst waits for the count-up to land, and for the best to load.
	let landed = reduced;
	const celebrate = (outcome: PersonalBestOutcome | null) => {
		if (!landed || reduced || outcome?.kind !== "new") return;
		void import("./pb-burst").then((m) => m.burstFrom(chipRef));
	};

	if (insights && !afk) {
		findPreviousBest({
			mode: insights.mode.type,
			duration: insights.mode.type === "time" ? insights.duration : undefined,
			before: insights.timestamp,
		})
			.then((best) => {
				const outcome = comparePersonalBest(props.wpm, best, false);
				setPb(outcome);
				celebrate(outcome);
			})
			.catch(() => setPb(null));
	}

	onMount(() => {
		if (reduced) {
			animate(containerRef, { opacity: [0, 1] }, { duration: 0.2 });
			later(0, () => setShowHistory(true));
			return;
		}

		const q = (selector: string) => containerRef.querySelectorAll(selector);
		const rise = (px: number) => [`translateY(${px}px)`, "translateY(0)"];

		animate(
			q(".hero-meta"),
			{ opacity: [0, 1], transform: rise(6) },
			{ duration: 0.3, ease: "easeOut" },
		);

		animate(0, props.wpm, {
			duration: COUNT_S,
			ease: [0.33, 1, 0.68, 1],
			onUpdate(value) {
				heroRef.textContent = Math.round(value).toString();
			},
			onComplete() {
				heroRef.textContent = String(props.wpm);
				landed = true;
				animate(
					heroWrap,
					{ transform: ["scale(1.06)", "scale(1)"] },
					{ type: spring, bounce: 0.3, visualDuration: 0.35 },
				);
				if (!afk) {
					animate(
						glowRef,
						{
							opacity: [0.12, 0.4, 0.14],
							transform: ["scale(0.9)", "scale(1.15)", "scale(1)"],
						},
						{ duration: 0.8, ease: "easeOut" },
					);
				}
				animate(
					chipRef,
					{ opacity: [0, 1], transform: ["scale(0.85)", "scale(1)"] },
					{ type: spring, bounce: 0.4, visualDuration: 0.3 },
				);
				celebrate(pb());
			},
		});

		animate(
			q(".stat-cell"),
			{ opacity: [0, 1], transform: rise(10) },
			{
				type: spring,
				bounce: 0.15,
				visualDuration: 0.45,
				delay: stagger(0.06, { startDelay: STATS_AT }),
			},
		);

		animate(
			q(".panel"),
			{ opacity: [0, 1], transform: rise(12) },
			{ duration: 0.45, delay: PANEL_AT, ease: [0.22, 1, 0.36, 1] },
		);

		animate(
			q(".breakdown-item"),
			{ opacity: [0, 1], transform: rise(6) },
			{ duration: 0.3, delay: stagger(0.06, { startDelay: CHARS_AT }) },
		);
		q(".breakdown-count").forEach((el, i) => {
			const target = Number((el as HTMLElement).dataset.count ?? 0);
			el.textContent = "0";
			animate(0, target, {
				duration: 0.7,
				delay: CHARS_AT + i * 0.06,
				ease: [0.22, 1, 0.36, 1],
				onUpdate(value) {
					el.textContent = Math.round(value).toString();
				},
			});
		});

		animate(
			q(".actions"),
			{ opacity: [0, 1], transform: rise(8) },
			{ duration: 0.35, delay: ACTIONS_AT, ease: "easeOut" },
		);

		later(HISTORY_AFTER_MS, () => setShowHistory(true));
	});

	const copyImage = async () => {
		if (copyState() === "busy") return;
		setCopyState("busy");
		try {
			setCopyState(
				await copyResultImage({
					wpm: props.wpm,
					rawWpm: props.rawWpm,
					accuracy: props.accuracy,
					consistency: props.consistency,
					time: formatTime(props.elapsed),
					mode: insights ? modeLabel(insights.mode) : "",
					wpmPerSecond: props.wpmPerSecond,
					rawPerSecond: insights?.rawPerSecond ?? [],
					pb: pb(),
				}),
			);
		} catch {
			setCopyState("failed");
		}
		later(1800, () => setCopyState("idle"));
	};

	const hidden = reduced ? "" : "opacity-0";
	const outcome = <K extends PersonalBestOutcome["kind"]>(kind: K) => {
		const o = pb();
		return o?.kind === kind
			? (o as Extract<PersonalBestOutcome, { kind: K }>)
			: undefined;
	};

	return (
		<div
			ref={containerRef}
			class="mx-auto flex w-[min(48rem,calc(100vw-4rem))] flex-col items-center"
			data-testid="results"
		>
			{/* The result fills the first screen, so history mounting below it
			    never shifts it. */}
			<div class="flex min-h-[calc(100svh-9.75rem)] w-full flex-col items-center justify-center gap-6 sm:gap-7">
				{/* Hero */}
				<div class="relative flex flex-col items-center">
					<div
						ref={glowRef}
						class="pointer-events-none absolute left-1/2 top-1/2 h-[220px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full"
						style={{
							background:
								"radial-gradient(closest-side, var(--primary), transparent)",
							opacity: afk ? "0" : "0.12",
						}}
					/>
					<div
						class={`hero-meta relative flex items-center gap-2 font-display text-xs uppercase tracking-[0.25em] text-text-sub ${hidden}`}
					>
						<span>wpm</span>
						<Show when={insights}>
							{(i) => (
								<>
									<span class="text-text-sub/50" aria-hidden="true">
										·
									</span>
									<span data-testid="result-mode">{modeLabel(i().mode)}</span>
								</>
							)}
						</Show>
					</div>
					<div ref={heroWrap} class="relative">
						<span
							ref={heroRef}
							class="block font-display text-[6.5rem] font-bold leading-none tracking-tight tabular-nums sm:text-[8rem]"
							classList={{ "text-primary": !afk, "text-text-sub": afk }}
							data-testid="result-wpm"
						>
							{reduced ? props.wpm : 0}
						</span>
					</div>
					<div
						ref={chipRef}
						class={`relative mt-3 flex h-8 items-center ${hidden}`}
						data-testid="pb-chip"
					>
						<Switch>
							<Match when={outcome("new")}>
								{(o) => <Chip tone="primary">+{o().delta} PB</Chip>}
							</Match>
							<Match when={outcome("first")}>
								<Chip tone="primary">first PB</Chip>
							</Match>
							<Match when={outcome("held")}>
								{(o) => <Chip tone="muted">PB {o().best}</Chip>}
							</Match>
							<Match when={outcome("afk")}>
								<Chip tone="muted">AFK detected</Chip>
							</Match>
						</Switch>
					</div>
					<Show when={afk}>
						<p class="relative mt-2 max-w-xs text-center text-xs text-text-sub">
							No keys in the last 5 seconds, so this run doesn't count toward
							your best.
						</p>
					</Show>
				</div>

				{/* Stats */}
				<div class="grid w-full grid-cols-2 gap-y-4 sm:grid-cols-4">
					<StatCell
						label="accuracy"
						value={`${props.accuracy}`}
						sub="%"
						hidden={hidden}
					/>
					<StatCell
						label="consistency"
						value={`${props.consistency}`}
						sub="%"
						hidden={hidden}
					/>
					<StatCell label="raw" value={`${props.rawWpm}`} hidden={hidden} />
					<StatCell
						label="time"
						value={formatTime(props.elapsed)}
						hidden={hidden}
					/>
				</div>

				<Show when={props.saveFailed}>
					<p role="status" class="-mt-4 text-xs text-text-sub">
						Couldn't save this result
					</p>
				</Show>

				{/* Chart and character breakdown */}
				<div
					class={`panel w-full rounded-2xl border border-text-sub/10 bg-bg-secondary/50 px-4 pt-4 pb-4 sm:px-6 sm:pt-5 ${hidden}`}
				>
					<Show when={props.wpmPerSecond.length > 1}>
						<div class="mb-3 flex items-center justify-between gap-4 font-display text-[11px] text-text-sub">
							<span class="font-display uppercase tracking-[0.2em]">
								wpm over time
							</span>
							<span class="flex items-center gap-4">
								<Show when={insights?.rawPerSecond.length}>
									<span class="flex items-center gap-1.5">
										<span class="h-0.5 w-3 rounded bg-text-sub" />
										raw
									</span>
								</Show>
								<Show when={insights?.errorsPerSecond.some((n) => n > 0)}>
									<span class="flex items-center gap-1.5">
										<span class="h-2 w-0.5 rounded bg-error" />
										errors
									</span>
								</Show>
							</span>
						</div>
						<WPMChart
							wpm={props.wpmPerSecond}
							raw={insights?.rawPerSecond}
							errors={insights?.errorsPerSecond}
							drawDelay={reduced ? null : CHART_AT}
						/>
					</Show>

					<div class="mt-4 border-t border-text-sub/10 pt-4">
						<div class="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
							<BreakdownItem
								label="correct"
								count={props.breakdown.correct}
								dot="bg-primary"
								hidden={hidden}
							/>
							<BreakdownItem
								label="incorrect"
								count={props.breakdown.incorrect}
								dot="bg-error"
								hidden={hidden}
							/>
							<BreakdownItem
								label="missed"
								count={props.breakdown.missed}
								dot="bg-text-sub"
								hidden={hidden}
							/>
							<BreakdownItem
								label="extra"
								count={props.breakdown.extra}
								dot="bg-error-extra"
								hidden={hidden}
							/>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div class={`actions flex flex-col items-center gap-2 ${hidden}`}>
					<div class="flex items-center gap-3">
						<button
							ref={redoRef}
							type="button"
							class="inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3 font-display text-sm font-semibold text-bg shadow-[0_0_24px_-6px_var(--primary)] transition-[transform,filter] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
							onClick={() => props.onRedo()}
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								stroke-width="2.25"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 12a9 9 0 1 0 3-6.7" />
								<path d="M3 4v5h5" />
							</svg>
							{props.redoLabel ?? "Redo"}
						</button>
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-lg border border-text-sub/25 px-4 py-3 font-display text-sm text-text-sub transition-colors hover:border-primary/50 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-60"
							onClick={copyImage}
							disabled={copyState() === "busy"}
							data-testid="copy-image"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<rect x="3" y="5" width="18" height="14" rx="2" />
								<circle cx="9" cy="10" r="1.5" />
								<path d="m21 16-5-5-8 8" />
							</svg>
							<span aria-live="polite">{COPY_LABELS[copyState()]}</span>
						</button>
					</div>
					<span class="text-xs text-text-sub/70">
						<kbd class="rounded bg-bg-secondary px-1.5 py-0.5 text-[10px] text-text-sub">
							Tab
						</kbd>
						{" + "}
						<kbd class="rounded bg-bg-secondary px-1.5 py-0.5 text-[10px] text-text-sub">
							Enter
						</kbd>
					</span>
				</div>
			</div>

			{/* History */}
			<Show when={showHistory()}>
				<div class="w-full pt-10">
					<HistoryList />
				</div>
			</Show>
		</div>
	);
}
