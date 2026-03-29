import type { BookMeta, BookProgress } from "@/lib/core/types/book";

interface BookCardProps {
	book: BookMeta;
	progress?: BookProgress;
	onClick: (book: BookMeta) => void;
}

export default function BookCard(props: BookCardProps) {
	const progressPercent = () => {
		const p = props.progress;
		if (!p || !props.book.wordCount) return 0;
		return Math.round((p.totalCharsTyped / (props.book.wordCount * 5)) * 100);
	};

	return (
		<button
			type="button"
			class="group flex flex-col items-center gap-2 text-left transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-lg p-2"
			onClick={() => props.onClick(props.book)}
		>
			<div class="relative w-[140px] h-[210px] rounded-md overflow-hidden bg-bg-secondary shadow-lg">
				{props.book.coverUrl ? (
					<img
						src={props.book.coverUrl}
						alt={`Cover of ${props.book.title}`}
						class="w-full h-full object-cover transition-all group-hover:brightness-110"
						loading="lazy"
					/>
				) : (
					<div class="w-full h-full flex items-center justify-center text-text-sub text-xs p-3 text-center">
						{props.book.title}
					</div>
				)}

				{/* Progress bar overlay */}
				{props.progress && (
					<div class="absolute bottom-0 left-0 right-0 h-1.5 bg-bg/60">
						<div
							class="h-full bg-primary transition-all"
							style={{ width: `${progressPercent()}%` }}
						/>
					</div>
				)}

				{/* Hover border glow */}
				<div class="absolute inset-0 rounded-md border-2 border-transparent group-hover:border-primary/40 transition-colors" />
			</div>

			<div class="w-[140px]">
				<p class="text-sm text-text truncate font-medium">{props.book.title}</p>
				<p class="text-xs text-text-sub truncate">{props.book.author}</p>
				{props.progress ? (
					<p class="text-xs text-primary">
						Ch.{props.progress.chapterIndex + 1} · {progressPercent()}%
					</p>
				) : (
					props.book.wordCount > 0 && (
						<p class="text-xs text-text-sub">
							{Math.round(props.book.wordCount / 1000)}k words
						</p>
					)
				)}
			</div>
		</button>
	);
}
