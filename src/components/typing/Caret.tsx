import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	on,
} from "solid-js";
import {
	getCaretPosition,
	type LayoutCache,
} from "@/lib/core/layout/layout-cache";

export type CaretStyle = "line" | "block" | "underline";

interface CaretProps {
	layoutCache: Accessor<LayoutCache>;
	currentWordIndex: number;
	currentCharIndex: number;
	style?: CaretStyle;
	smooth?: boolean;
	ref?: (el: HTMLDivElement) => void;
}

export default function Caret(props: CaretProps) {
	const [isIdle, setIsIdle] = createSignal(true);
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	const caretStyle = () => props.style ?? "line";
	const smooth = () => props.smooth ?? true;

	const position = createMemo(() =>
		getCaretPosition(
			props.layoutCache(),
			props.currentWordIndex,
			props.currentCharIndex,
		),
	);

	createEffect(
		on([() => props.currentWordIndex, () => props.currentCharIndex], () => {
			setIsIdle(false);
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(() => setIsIdle(true), 1500);
		}),
	);

	// Positioned by transform only, so a move never touches layout.
	const styleProps = () => {
		const p = position();
		const left = p?.left ?? 0;
		const top = p?.top ?? 0;
		const width = p?.width ?? 0;

		switch (caretStyle()) {
			case "block":
				return {
					transform: `translate3d(${left}px, ${top}px, 0)`,
					width: `${width || 10}px`,
					height: "1.5em",
				};
			case "underline":
				return {
					transform: `translate3d(${left}px, calc(${top}px + 1.35em), 0)`,
					width: `${width || 10}px`,
					height: "2px",
				};
			default:
				return {
					transform: `translate3d(${left}px, ${top}px, 0)`,
					width: "2px",
					height: "1.5em",
				};
		}
	};

	return (
		<div
			ref={props.ref}
			class="caret absolute left-0 top-0 will-change-transform"
			classList={{
				"caret-idle": isIdle(),
				"caret-glide transition-transform": smooth(),
				"caret-block": caretStyle() === "block",
			}}
			style={styleProps()}
			data-testid="caret"
		/>
	);
}
