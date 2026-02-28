import { For, Show } from "solid-js";
import type { TypingResult } from "@/lib/db";
import { usePersonalBest, useRecentResults } from "@/lib/queries";

function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function HistoryList() {
	const results = useRecentResults(10);
	const best = usePersonalBest();

	return (
		<div class="w-full max-w-2xl mx-auto flex flex-col gap-6">
			{/* Personal Best */}
			<Show when={best()}>
				{(pb) => (
					<div class="flex items-center gap-4 px-4 py-3 bg-bg-secondary rounded border border-primary/20">
						<span class="text-xs uppercase tracking-widest text-primary">
							personal best
						</span>
						<span class="text-2xl font-bold text-primary">{pb().wpm}</span>
						<span class="text-text-sub text-sm">WPM</span>
						<span class="text-text-sub text-sm ml-auto">
							{pb().accuracy}% accuracy
						</span>
					</div>
				)}
			</Show>

			{/* History */}
			<Show when={results() && results()!.length > 0}>
				<div class="flex flex-col gap-2">
					<span class="text-xs uppercase tracking-widest text-text-sub">
						recent
					</span>
					<div class="flex flex-col gap-1">
						<For each={results()}>
							{(result: TypingResult) => (
								<div class="flex items-center gap-4 px-4 py-2 bg-bg-secondary/50 rounded text-sm">
									<span class="text-text font-bold w-16">
										{result.wpm} wpm
									</span>
									<span class="text-text-sub w-16">
										{result.accuracy}%
									</span>
									<span class="text-text-sub w-12">{result.mode}</span>
									<span class="text-text-sub ml-auto text-xs">
										{formatDate(result.timestamp)}
									</span>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>
		</div>
	);
}
