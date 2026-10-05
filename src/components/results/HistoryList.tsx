import { For, Show } from "solid-js";
import type { TypingResult } from "@/lib/db";
import { useRecentResults } from "@/lib/queries";

function formatDay(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function formatClock(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function HistoryList() {
	const results = useRecentResults(10);

	return (
		<Show when={results().length > 0}>
			<section class="flex w-full flex-col gap-3" aria-label="Recent results">
				<span class="font-display text-[11px] uppercase tracking-[0.2em] text-text-sub">
					recent
				</span>
				<ol class="flex flex-col divide-y divide-text-sub/10 rounded-xl border border-text-sub/10">
					<For each={results()}>
						{(result: TypingResult) => (
							<li
								class="grid grid-cols-[4.5rem_3.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm tabular-nums"
								classList={{ "opacity-50": result.afk }}
							>
								<span class="font-display font-bold text-text after:ml-1 after:font-normal after:text-xs after:text-text-sub after:content-['wpm']">
									{result.wpm}
								</span>
								<span class="text-text-sub">{result.accuracy}%</span>
								<span class="flex min-w-0 items-center gap-2 text-text-sub">
									<span class="shrink-0">{result.mode}</span>
									<Show when={result.bookTitle}>
										<span class="truncate text-xs">{result.bookTitle}</span>
									</Show>
									<Show when={result.afk}>
										<span class="shrink-0 rounded bg-text-sub/15 px-1.5 text-[10px] uppercase tracking-wider">
											afk
										</span>
									</Show>
								</span>
								<span class="text-right text-xs text-text-sub">
									{formatDay(result.timestamp)}
									<span class="hidden sm:inline">
										, {formatClock(result.timestamp)}
									</span>
								</span>
							</li>
						)}
					</For>
				</ol>
			</section>
		</Show>
	);
}
