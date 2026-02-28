interface StatsBarProps {
	wpm: number;
	accuracy: number;
	elapsed: number;
}

function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

export default function StatsBar(props: StatsBarProps) {
	return (
		<div
			class="flex gap-8 mb-4 text-text-sub text-lg font-mono"
			data-testid="stats-bar"
		>
			<div>
				<span class="text-primary text-2xl font-bold">{props.wpm}</span>{" "}
				<span class="text-sm">wpm</span>
			</div>
			<div>
				<span class="text-primary text-2xl font-bold">{props.accuracy}</span>
				<span class="text-sm">%</span>
			</div>
			<div>
				<span class="text-2xl font-bold">{formatTime(props.elapsed)}</span>
			</div>
		</div>
	);
}
