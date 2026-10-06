import { Show } from "solid-js";
import { coverToneBackground } from "@/lib/book-format";
import type { BookMeta } from "@/lib/core/types/book";

/** A small cover for rows: the image over the book's tone colour. */
export default function BookThumb(props: { book: BookMeta; class?: string }) {
	return (
		<div
			class={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-[3px] shadow-sm ring-1 ring-text/10 ${props.class ?? "w-8"}`}
			style={{ background: coverToneBackground(props.book.id) }}
			aria-hidden="true"
		>
			<Show when={props.book.coverUrl}>
				<img
					src={props.book.coverUrl}
					alt=""
					decoding="async"
					class="absolute inset-0 h-full w-full object-cover"
					onError={(e) => e.currentTarget.remove()}
				/>
			</Show>
		</div>
	);
}
