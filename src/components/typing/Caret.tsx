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

	const styleProps = () => {
		const p = position();
		const left = p?.left ?? 0;
		const top = p?.top ?? 0;
		const width = p?.width ?? 0;
		const base = { left: `${left}px`, top: `${top}px` };

		switch (caretStyle()) {
			case "block":
				return { ...base, width: `${width || 10}px`, height: "1.5em" };
			case "underline":
				return {
					...base,
					top: `calc(${top}px + 1.35em)`,
					width: `${width || 10}px`,
					height: "2px",
				};
			default:
				return { ...base, width: "2px", height: "1.5em" };
		}
	};

	return (
		<div
			class="absolute bg-caret will-change-transform"
			classList={{
				"animate-blink": isIdle(),
				"transition-[left,top] duration-[80ms]": smooth(),
				"opacity-50": caretStyle() === "block",
			}}
			style={styleProps()}
			data-testid="caret"
		/>
	);
}
