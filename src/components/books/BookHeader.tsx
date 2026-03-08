import type { BookMeta } from "@/lib/core/types/book";

interface BookHeaderProps {
	book: BookMeta;
	chapterIndex: number;
	chapterTitle?: string;
	progressPercent: number;
}

export default function BookHeader(props: BookHeaderProps) {
	return (
		<div class="w-full max-w-4xl mx-auto mb-4">
			<div class="flex items-center justify-between text-sm text-text-sub">
				<span class="truncate max-w-[60%]">
					{props.book.title} · {props.chapterTitle ?? `Chapter ${props.chapterIndex + 1}`}
				</span>
				<span>{props.progressPercent}%</span>
			</div>
			<div class="mt-1 h-0.5 bg-bg-secondary rounded-full overflow-hidden">
				<div
					class="h-full bg-primary/40 transition-all"
					style={{ width: `${props.progressPercent}%` }}
				/>
			</div>
		</div>
	);
}
