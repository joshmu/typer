import { createMemo } from "solid-js";

interface WPMChartProps {
	data: number[];
	width?: number;
	height?: number;
}

export default function WPMChart(props: WPMChartProps) {
	const width = () => props.width ?? 600;
	const height = () => props.height ?? 200;
	const padding = { top: 20, right: 20, bottom: 30, left: 45 };

	const chartWidth = () => width() - padding.left - padding.right;
	const chartHeight = () => height() - padding.top - padding.bottom;

	const yMax = createMemo(() => {
		if (props.data.length === 0) return 100;
		return Math.ceil(Math.max(...props.data) / 20) * 20 || 100;
	});

	const yTicks = createMemo(() => {
		const max = yMax();
		const step = Math.max(Math.floor(max / 4), 1);
		const ticks: number[] = [];
		for (let i = 0; i <= max; i += step) {
			ticks.push(i);
		}
		return ticks;
	});

	const points = createMemo(() => {
		if (props.data.length === 0) return "";
		const xStep =
			props.data.length > 1 ? chartWidth() / (props.data.length - 1) : 0;
		return props.data
			.map((val, i) => {
				const x = padding.left + i * xStep;
				const y =
					padding.top + chartHeight() - (val / yMax()) * chartHeight();
				return `${x},${y}`;
			})
			.join(" ");
	});

	const areaPath = createMemo(() => {
		if (props.data.length === 0) return "";
		const xStep =
			props.data.length > 1 ? chartWidth() / (props.data.length - 1) : 0;
		const linePoints = props.data.map((val, i) => {
			const x = padding.left + i * xStep;
			const y = padding.top + chartHeight() - (val / yMax()) * chartHeight();
			return `${x},${y}`;
		});
		const baseline = padding.top + chartHeight();
		const firstX = padding.left;
		const lastX = padding.left + (props.data.length - 1) * xStep;
		return `M ${firstX},${baseline} L ${linePoints.join(" L ")} L ${lastX},${baseline} Z`;
	});

	return (
		<svg
			width={width()}
			height={height()}
			viewBox={`0 0 ${width()} ${height()}`}
			class="w-full max-w-2xl"
			role="img"
			aria-label="WPM over time chart"
		>
			{/* Gradient definition for area fill */}
			<defs>
				<linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.15" />
					<stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
				</linearGradient>
			</defs>

			{/* Y-axis grid lines and labels */}
			{yTicks().map((tick) => {
				const y =
					padding.top + chartHeight() - (tick / yMax()) * chartHeight();
				return (
					<>
						<line
							x1={padding.left}
							y1={y}
							x2={padding.left + chartWidth()}
							y2={y}
							stroke="var(--text-sub)"
							stroke-opacity="0.2"
							stroke-dasharray="4,4"
						/>
						<text
							x={padding.left - 8}
							y={y + 4}
							text-anchor="end"
							fill="var(--text-sub)"
							font-size="11"
							font-family="inherit"
						>
							{tick}
						</text>
					</>
				);
			})}

			{/* X-axis labels */}
			{props.data.length > 0 && (
				<>
					<text
						x={padding.left}
						y={padding.top + chartHeight() + 20}
						text-anchor="middle"
						fill="var(--text-sub)"
						font-size="11"
						font-family="inherit"
					>
						1s
					</text>
					<text
						x={
							padding.left +
							(props.data.length > 1
								? chartWidth()
								: 0)
						}
						y={padding.top + chartHeight() + 20}
						text-anchor="middle"
						fill="var(--text-sub)"
						font-size="11"
						font-family="inherit"
					>
						{props.data.length}s
					</text>
				</>
			)}

			{/* Area fill */}
			{areaPath() && (
				<path d={areaPath()} fill="url(#areaGradient)" />
			)}

			{/* Line */}
			{points() && (
				<polyline
					points={points()}
					fill="none"
					stroke="var(--primary)"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			)}

			{/* Data points */}
			{props.data.map((val, i) => {
				const xStep =
					props.data.length > 1
						? chartWidth() / (props.data.length - 1)
						: 0;
				const x = padding.left + i * xStep;
				const y =
					padding.top + chartHeight() - (val / yMax()) * chartHeight();
				return (
					<circle
						cx={x}
						cy={y}
						r="3"
						fill="var(--bg)"
						stroke="var(--primary)"
						stroke-width="2"
					/>
				);
			})}
		</svg>
	);
}
