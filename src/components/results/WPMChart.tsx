import { animate } from "motion";
import {
	createMemo,
	createSignal,
	createUniqueId,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	formatSecond,
	monotonePath,
	movingAverage,
	smoothingWindow,
	timeTicks,
	wpmScale,
} from "./chart-scale";

interface WPMChartProps {
	/** True per-second WPM; the line shows its moving average. */
	wpm: number[];
	raw?: number[];
	errors?: number[];
	height?: number;
	/** Seconds before the lines draw themselves in; null shows them drawn. */
	drawDelay?: number | null;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 36 };
const DRAW_S = 0.6;
const FALLBACK_WIDTH = 640;

export default function WPMChart(props: WPMChartProps) {
	let containerRef!: HTMLDivElement;
	let wpmLine!: SVGPathElement;
	let rawLine: SVGPathElement | undefined;
	let areaRef!: SVGPathElement;
	let endDot!: SVGCircleElement;
	let markersRef!: SVGGElement;

	const gradientId = `wpm-area-${createUniqueId()}`;
	const [width, setWidth] = createSignal(FALLBACK_WIDTH);
	const [hovered, setHovered] = createSignal<number | null>(null);

	const height = () => props.height ?? 170;
	const chartW = () => Math.max(width() - PAD.left - PAD.right, 1);
	const chartH = () => height() - PAD.top - PAD.bottom;
	const baseline = () => PAD.top + chartH();
	const count = () => props.wpm.length;

	const scale = createMemo(() =>
		wpmScale(Math.max(...props.wpm, ...(props.raw ?? []), 0)),
	);

	const x = (i: number) =>
		count() > 1
			? PAD.left + (i / (count() - 1)) * chartW()
			: PAD.left + chartW() / 2;
	const y = (v: number) => baseline() - (v / scale().max) * chartH();

	const smoothed = createMemo(() =>
		movingAverage(props.wpm, smoothingWindow(count())),
	);
	const wpmPoints = createMemo(() =>
		smoothed().map((v, i) => [x(i), y(v)] as const),
	);
	const wpmPath = createMemo(() => monotonePath(wpmPoints()));
	const rawPath = createMemo(() =>
		props.raw && props.raw.length === count()
			? monotonePath(props.raw.map((v, i) => [x(i), y(v)] as const))
			: "",
	);
	const areaPath = createMemo(() => {
		const pts = wpmPoints();
		if (pts.length < 2) return "";
		const last = pts[pts.length - 1][0];
		return `${wpmPath()} L${last},${baseline()} L${pts[0][0]},${baseline()} Z`;
	});
	const errorSeconds = createMemo(() =>
		(props.errors ?? [])
			.map((n, i) => ({ i, n }))
			.filter(({ n, i }) => n > 0 && i < count()),
	);

	const animated = () => props.drawDelay != null;

	onMount(() => {
		setWidth(containerRef.clientWidth || FALLBACK_WIDTH);
		const observer = new ResizeObserver(([entry]) => {
			if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
		});
		observer.observe(containerRef);
		onCleanup(() => observer.disconnect());

		const delay = props.drawDelay;
		if (delay == null) return;

		const running: { stop(): void }[] = [];
		onCleanup(() => {
			for (const control of running) control.stop();
		});
		const track = (control: { stop(): void }) => running.push(control);

		const lines = rawLine ? [wpmLine, rawLine] : [wpmLine];
		track(
			animate(
				lines,
				{ strokeDashoffset: [1, 0] },
				{ duration: DRAW_S, delay, ease: [0.65, 0, 0.35, 1] },
			),
		);
		track(
			animate(
				areaRef,
				{ opacity: [0, 1] },
				{ duration: 0.4, delay: delay + DRAW_S * 0.6 },
			),
		);
		track(
			animate(
				endDot,
				{ opacity: [0, 1], transform: ["scale(0)", "scale(1)"] },
				{ duration: 0.25, delay: delay + DRAW_S, ease: [0.34, 1.56, 0.64, 1] },
			),
		);
		// Each error mark appears as the line passes its second.
		for (const mark of markersRef.querySelectorAll("rect")) {
			const at = Number(mark.dataset.at ?? 0);
			track(
				animate(
					mark,
					{ opacity: [0, 1], transform: ["scaleY(0)", "scaleY(1)"] },
					{ duration: 0.2, delay: delay + at * DRAW_S },
				),
			);
		}
	});

	const pick = (e: PointerEvent) => {
		if (count() === 0) return;
		const rect = containerRef.getBoundingClientRect();
		const px = e.clientX - rect.left - PAD.left;
		const i = count() > 1 ? Math.round((px / chartW()) * (count() - 1)) : 0;
		setHovered(Math.min(Math.max(i, 0), count() - 1));
	};

	const tooltipLeft = () => {
		const i = hovered();
		if (i === null) return 0;
		return Math.min(Math.max(x(i), 72), width() - 72);
	};

	return (
		<div
			ref={containerRef}
			class="relative w-full select-none font-display"
			style={{ height: `${height()}px`, "touch-action": "pan-y" }}
			onPointerMove={pick}
			onPointerDown={pick}
			onPointerLeave={() => setHovered(null)}
		>
			<svg
				width={width()}
				height={height()}
				viewBox={`0 0 ${width()} ${height()}`}
				class="block overflow-visible"
				role="img"
				aria-label={`WPM over ${count()} seconds, peaking at ${Math.max(...props.wpm, 0)}`}
			>
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.22" />
						<stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
					</linearGradient>
				</defs>

				<For each={scale().ticks}>
					{(tick) => (
						<>
							<line
								x1={PAD.left}
								x2={PAD.left + chartW()}
								y1={y(tick)}
								y2={y(tick)}
								stroke="var(--text-sub)"
								stroke-opacity={tick === 0 ? 0.35 : 0.12}
							/>
							<text
								x={PAD.left - 10}
								y={y(tick) + 4}
								text-anchor="end"
								fill="var(--text-sub)"
								font-size="11"
								class="tabular-nums"
							>
								{tick}
							</text>
						</>
					)}
				</For>

				<For each={timeTicks(count())}>
					{(second) => (
						<text
							x={x(second - 1)}
							y={baseline() + 18}
							text-anchor="middle"
							fill="var(--text-sub)"
							font-size="11"
							class="tabular-nums"
						>
							{formatSecond(second)}
						</text>
					)}
				</For>

				<path
					ref={areaRef}
					d={areaPath()}
					fill={`url(#${gradientId})`}
					style={{ opacity: animated() ? 0 : 1 }}
				/>

				<Show when={rawPath()}>
					<path
						ref={rawLine}
						d={rawPath()}
						fill="none"
						stroke="var(--text-sub)"
						stroke-opacity="0.7"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						pathLength="1"
						stroke-dasharray="1 2"
						style={{ "stroke-dashoffset": animated() ? 1 : 0 }}
					/>
				</Show>

				<path
					ref={wpmLine}
					d={wpmPath()}
					fill="none"
					stroke="var(--primary)"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					pathLength="1"
					stroke-dasharray="1 2"
					style={{
						"stroke-dashoffset": animated() ? 1 : 0,
						filter:
							"drop-shadow(0 0 6px color-mix(in srgb, var(--primary) 45%, transparent))",
					}}
				/>

				<g ref={markersRef}>
					<For each={errorSeconds()}>
						{({ i, n }) => {
							const h = 5 + Math.min(n, 3) * 2;
							return (
								<rect
									x={x(i) - 1.25}
									y={baseline() - h - 2}
									width="2.5"
									height={h}
									rx="1.25"
									fill="var(--error)"
									data-at={count() > 1 ? i / (count() - 1) : 0}
									style={{
										opacity: animated() ? 0 : 1,
										"transform-box": "fill-box",
										"transform-origin": "bottom",
									}}
								/>
							);
						}}
					</For>
				</g>

				<circle
					ref={endDot}
					cx={wpmPoints().at(-1)?.[0] ?? 0}
					cy={wpmPoints().at(-1)?.[1] ?? 0}
					r="4"
					fill="var(--primary)"
					stroke="var(--bg)"
					stroke-width="2"
					style={{
						opacity: animated() ? 0 : 1,
						"transform-box": "fill-box",
						"transform-origin": "center",
					}}
				/>

				<Show when={hovered() !== null}>
					<line
						x1={x(hovered()!)}
						x2={x(hovered()!)}
						y1={PAD.top}
						y2={baseline()}
						stroke="var(--text-sub)"
						stroke-opacity="0.5"
						stroke-dasharray="3 3"
					/>
					<Show when={props.raw?.[hovered()!] !== undefined}>
						<circle
							cx={x(hovered()!)}
							cy={y(props.raw![hovered()!])}
							r="3"
							fill="var(--bg)"
							stroke="var(--text-sub)"
							stroke-width="1.5"
						/>
					</Show>
					<circle
						cx={x(hovered()!)}
						cy={y(smoothed()[hovered()!])}
						r="4.5"
						fill="var(--bg)"
						stroke="var(--primary)"
						stroke-width="2.5"
					/>
				</Show>
			</svg>

			<Show when={hovered() !== null}>
				<div
					class="pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full rounded-lg border border-text-sub/20 bg-bg-secondary px-3 py-2 text-xs shadow-lg tabular-nums whitespace-nowrap"
					style={{ left: `${tooltipLeft()}px` }}
					data-testid="chart-readout"
				>
					<div class="mb-1 text-text-sub">
						{formatSecond(hovered()! + 1)} · {smoothingWindow(count())}s avg{" "}
						{smoothed()[hovered()!]}
					</div>
					<div class="flex items-center gap-3">
						<span class="text-primary font-semibold">
							{props.wpm[hovered()!]} wpm
						</span>
						<Show when={props.raw?.[hovered()!] !== undefined}>
							<span class="text-text-sub">{props.raw![hovered()!]} raw</span>
						</Show>
						<Show when={(props.errors?.[hovered()!] ?? 0) > 0}>
							<span class="text-error">
								{props.errors![hovered()!]}{" "}
								{props.errors![hovered()!] === 1 ? "error" : "errors"}
							</span>
						</Show>
					</div>
				</div>
			</Show>
		</div>
	);
}
