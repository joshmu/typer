import { createSignal, onMount, Show } from "solid-js";
import { coverToneBackground } from "@/lib/book-format";
import { BOOK_SERIF } from "./typography";

interface BookCoverProps {
	bookId: string;
	title: string;
	author: string;
	src: string;
	/** Position in its grid, for the fade-in stagger. */
	index?: number;
	/** Hint the browser to fetch now (detail modal) rather than lazily. */
	eager?: boolean;
	/** Smaller type for thumbnails in tight rows. */
	compact?: boolean;
}

const STAGGER_MS = 15;
const MAX_STAGGER_STEPS = 12;

/**
 * A book cover that fades in once loaded, over a placeholder that holds its
 * space. Missing or broken covers become a title-on-colour cover.
 */
export default function BookCover(props: BookCoverProps) {
	const [loaded, setLoaded] = createSignal(false);
	const [failed, setFailed] = createSignal(false);
	let img: HTMLImageElement | undefined;

	onMount(() => {
		// A cached image can finish before the load listener is attached.
		if (img?.complete) {
			if (img.naturalWidth > 0) setLoaded(true);
			else if (img.src) setFailed(true);
		}
	});

	const delay = () =>
		`${Math.min(props.index ?? 0, MAX_STAGGER_STEPS) * STAGGER_MS}ms`;

	return (
		<div class="absolute inset-0 bg-bg-secondary">
			<Show
				when={props.src && !failed()}
				fallback={
					<div
						class="absolute inset-0 flex flex-col items-center justify-center p-[9%] text-center"
						style={{ background: coverToneBackground(props.bookId) }}
						data-testid="cover-fallback"
						aria-hidden="true"
					>
						<div class="absolute inset-[5%] rounded-[3px] border border-text/15" />
						<p
							class={`${BOOK_SERIF} ${props.compact ? "text-sm" : "text-base sm:text-lg"} font-semibold leading-tight text-text line-clamp-5 [overflow-wrap:anywhere]`}
						>
							{props.title}
						</p>
						<span class="my-2.5 h-px w-6 bg-text/30" />
						<p class="text-[0.6rem] uppercase tracking-[0.18em] text-text/70 line-clamp-2">
							{props.author}
						</p>
					</div>
				}
			>
				<img
					ref={img}
					src={props.src}
					alt=""
					loading={props.eager ? "eager" : "lazy"}
					decoding="async"
					class={`absolute inset-0 h-full w-full object-cover motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out ${
						loaded() ? "opacity-100 scale-100" : "opacity-0 scale-[1.02]"
					}`}
					style={{ "transition-delay": delay() }}
					onLoad={() => setLoaded(true)}
					onError={() => setFailed(true)}
				/>
			</Show>
		</div>
	);
}
