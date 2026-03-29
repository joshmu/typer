import { animate, spring, stagger } from "motion";
import { onMount, Show } from "solid-js";
import type { CharBreakdown } from "@/lib/core/calc";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";
import HistoryList from "./HistoryList";
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
}

function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

function StatCard(props: { label: string; value: string; sub?: string }) {
	return (
		<div class="stat-card flex flex-col gap-1 opacity-0">
			<span class="font-display text-xs uppercase tracking-widest text-text-sub">
				{props.label}
			</span>
			<span class="text-3xl font-bold text-text">
				{props.value}
				{props.sub && (
					<span class="text-lg text-text-sub font-normal">{props.sub}</span>
				)}
			</span>
		</div>
	);
}

function BreakdownItem(props: { label: string; count: number; color: string }) {
	return (
		<div class="breakdown-item flex items-center gap-3 opacity-0">
			<span class={`w-2 h-2 rounded-full ${props.color}`} />
			<span class="text-text-sub text-sm w-20">{props.label}</span>
			<span class="text-text text-sm font-bold">{props.count}</span>
		</div>
	);
}

export default function ResultsScreen(props: ResultsScreenProps) {
	let heroRef!: HTMLSpanElement;
	let containerRef!: HTMLDivElement;

	onMount(() => {
		const reduced = prefersReducedMotion();

		if (reduced) {
			heroRef.textContent = String(props.wpm);
			containerRef
				.querySelectorAll(
					".stat-card, .breakdown-item, .chart-section, .redo-section",
				)
				.forEach((el) => {
					(el as HTMLElement).style.opacity = "1";
				});
			return;
		}

		// Animate hero WPM counter
		animate(0, props.wpm, {
			duration: 1,
			ease: [0.16, 1, 0.3, 1],
			onUpdate(value) {
				heroRef.textContent = Math.round(value).toString();
			},
		});

		// Stagger stat cards
		animate(
			containerRef.querySelectorAll(".stat-card"),
			{ opacity: [0, 1], transform: ["translateY(12px)", "translateY(0)"] },
			{
				type: spring,
				bounce: 0.15,
				visualDuration: 0.5,
				delay: stagger(0.08, { startDelay: 0.3 }),
			},
		);

		// Stagger breakdown items
		animate(
			containerRef.querySelectorAll(".breakdown-item"),
			{ opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] },
			{
				type: spring,
				bounce: 0.1,
				visualDuration: 0.4,
				delay: stagger(0.06, { startDelay: 0.6 }),
			},
		);

		// Chart + redo fade in
		animate(
			containerRef.querySelectorAll(".chart-section, .redo-section"),
			{ opacity: [0, 1] },
			{ duration: 0.5, delay: stagger(0.15, { startDelay: 0.8 }) },
		);
	});

	return (
		<div
			ref={containerRef}
			class="w-full max-w-2xl mx-auto flex flex-col items-center gap-10"
		>
			{/* Hero WPM */}
			<div class="relative flex flex-col items-center gap-1">
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] pointer-events-none rounded-full"
					style={{
						background:
							"radial-gradient(circle, var(--primary) 0%, transparent 70%)",
						opacity: "0.06",
					}}
				/>
				<span class="font-display text-xs uppercase tracking-widest text-text-sub">
					wpm
				</span>
				<span
					ref={heroRef}
					class="font-display text-9xl font-light text-primary leading-none"
				>
					0
				</span>
			</div>

			{/* Stat cards row */}
			<div class="flex gap-12 justify-center">
				<StatCard label="accuracy" value={`${props.accuracy}`} sub="%" />
				<StatCard label="consistency" value={`${props.consistency}`} sub="%" />
				<StatCard label="raw" value={`${props.rawWpm}`} />
				<StatCard label="time" value={formatTime(props.elapsed)} />
			</div>

			{/* WPM Chart */}
			<Show when={props.wpmPerSecond.length > 1}>
				<div class="chart-section w-full opacity-0">
					<span class="font-display text-xs uppercase tracking-widest text-text-sub mb-2 block">
						wpm over time
					</span>
					<WPMChart data={props.wpmPerSecond} />
				</div>
			</Show>

			{/* Divider */}
			<div class="w-full h-px bg-text-sub/20" />

			{/* Character breakdown */}
			<div class="flex flex-col gap-3">
				<span class="font-display text-xs uppercase tracking-widest text-text-sub">
					characters
				</span>
				<div class="flex gap-8">
					<BreakdownItem
						label="correct"
						count={props.breakdown.correct}
						color="bg-primary"
					/>
					<BreakdownItem
						label="incorrect"
						count={props.breakdown.incorrect}
						color="bg-error"
					/>
					<BreakdownItem
						label="missed"
						count={props.breakdown.missed}
						color="bg-text-sub"
					/>
					<BreakdownItem
						label="extra"
						count={props.breakdown.extra}
						color="bg-error-extra"
					/>
				</div>
			</div>

			{/* Redo button */}
			<div class="redo-section flex flex-col items-center gap-2 mt-4 opacity-0">
				<button
					type="button"
					class="px-8 py-3 bg-bg-secondary text-text-sub rounded border border-text-sub/20 hover:text-primary hover:border-primary/40 transition-colors text-sm uppercase tracking-widest btn-glow"
					onClick={props.onRedo}
				>
					{props.redoLabel ?? "Redo"}
				</button>
				<span class="text-xs text-text-sub/60">
					<kbd class="px-1 py-0.5 bg-bg-secondary rounded text-text-sub text-[10px]">
						Tab
					</kbd>
					{" + "}
					<kbd class="px-1 py-0.5 bg-bg-secondary rounded text-text-sub text-[10px]">
						Enter
					</kbd>
				</span>
			</div>

			{/* History */}
			<div class="redo-section w-full mt-4 opacity-0">
				<HistoryList />
			</div>
		</div>
	);
}
