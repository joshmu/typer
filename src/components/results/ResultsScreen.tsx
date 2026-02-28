import type { CharBreakdown } from "@/lib/core/calc";

interface ResultsScreenProps {
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	breakdown: CharBreakdown;
	elapsed: number;
	onRedo: () => void;
}

function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

function StatCard(props: { label: string; value: string; sub?: string }) {
	return (
		<div class="flex flex-col gap-1">
			<span class="text-xs uppercase tracking-widest text-text-sub">
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

function BreakdownItem(props: {
	label: string;
	count: number;
	color: string;
}) {
	return (
		<div class="flex items-center gap-3">
			<span class={`w-2 h-2 rounded-full ${props.color}`} />
			<span class="text-text-sub text-sm w-20">{props.label}</span>
			<span class="text-text text-sm font-bold">{props.count}</span>
		</div>
	);
}

export default function ResultsScreen(props: ResultsScreenProps) {
	return (
		<div class="w-full max-w-2xl mx-auto flex flex-col items-center gap-10">
			{/* Hero WPM */}
			<div class="flex flex-col items-center gap-1">
				<span class="text-xs uppercase tracking-widest text-text-sub">
					wpm
				</span>
				<span class="text-8xl font-bold text-primary leading-none">
					{props.wpm}
				</span>
			</div>

			{/* Stat cards row */}
			<div class="flex gap-12 justify-center">
				<StatCard label="accuracy" value={`${props.accuracy}`} sub="%" />
				<StatCard
					label="consistency"
					value={`${props.consistency}`}
					sub="%"
				/>
				<StatCard label="raw" value={`${props.rawWpm}`} />
				<StatCard label="time" value={formatTime(props.elapsed)} />
			</div>

			{/* Divider */}
			<div class="w-full h-px bg-text-sub/20" />

			{/* Character breakdown */}
			<div class="flex flex-col gap-3">
				<span class="text-xs uppercase tracking-widest text-text-sub">
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
			<button
				type="button"
				class="mt-4 px-8 py-3 bg-bg-secondary text-text-sub rounded border border-text-sub/20 hover:text-primary hover:border-primary/40 transition-colors text-sm uppercase tracking-widest"
				onClick={props.onRedo}
			>
				Redo
			</button>
		</div>
	);
}
