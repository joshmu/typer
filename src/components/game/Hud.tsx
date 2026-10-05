import { animate, spring } from "motion";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	onCleanup,
	Show,
} from "solid-js";
import {
	type HudMoments,
	hudMoments,
	hudView,
	type PerkChip,
} from "@/lib/game/hud-view";
import type { GameState } from "@/lib/game/sim/state";
import { type Frame, inFrame } from "@/lib/game/view";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";

/** Rarity accent for a perk glyph and border, all on theme tokens. */
export function rarityText(rarity: PerkChip["rarity"]): string {
	if (rarity === "epic") return "text-primary";
	if (rarity === "rare") return "text-text";
	return "text-text-sub";
}

function chipBorder(rarity: PerkChip["rarity"]): string {
	if (rarity === "epic") return "border-primary/60";
	if (rarity === "rare") return "border-text/30";
	return "border-text/15";
}

// small caps label above a HUD number
const LABEL =
	"font-display text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-text-sub";
// a translucent panel so HUD text reads over any part of the arena
const PANEL = "rounded-lg border border-text/10 bg-bg/65 backdrop-blur-sm";
// a broken combo drains red for this long, then the panel leaves
const BREAK_MS = 520;
const SNAP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** A banner slamming in: its text's scale and tracking settle, it holds,
 * then `frame` (the text itself if absent) lifts away. Reduced motion only
 * fades it. */
export function slamIn(
	text: HTMLElement,
	opts: { exit: boolean; frame?: HTMLElement; tracking?: number },
): void {
	const box = opts.frame ?? text;
	const reduced = prefersReducedMotion();
	if (reduced) {
		animate(
			box,
			{ opacity: opts.exit ? [0, 1, 1, 0] : [0, 1] },
			{
				duration: opts.exit ? 1.25 : 0.2,
				times: opts.exit ? [0, 0.1, 0.8, 1] : undefined,
			},
		);
		return;
	}
	animate(
		text,
		{ scale: [1.6, 1] },
		{ type: spring, bounce: 0.35, visualDuration: 0.35 },
	);
	const em = opts.tracking ?? 0.3;
	animate(
		text,
		{ letterSpacing: [`${em * 2}em`, `${em}em`] },
		{ duration: 0.45, ease: [0.16, 1, 0.3, 1] },
	);
	if (opts.exit) {
		// in fast, hold ~600ms, lift away over 250ms
		animate(
			box,
			{ opacity: [0, 1, 1, 0], y: [0, 0, 0, -28] },
			{ duration: 1.2, times: [0, 0.05, 0.79, 1], ease: "easeIn" },
		);
	} else {
		animate(box, { opacity: [0, 1] }, { duration: 0.08 });
	}
}

/** The lost heart pops and breaks into shards that scatter and fade. */
function shatter(heart: HTMLElement, reduced: boolean): void {
	if (reduced) {
		animate(heart, { opacity: [0.2, 1] }, { duration: 0.35 });
		return;
	}
	animate(
		heart,
		{ scale: [1.8, 1] },
		{ type: spring, bounce: 0.4, visualDuration: 0.35 },
	);
	const SHARDS = 6;
	for (let i = 0; i < SHARDS; i++) {
		const shard = document.createElement("span");
		shard.className =
			"pointer-events-none absolute top-1/2 left-1/2 size-1.5 rounded-[1px] bg-error";
		heart.appendChild(shard);
		const a = (i / SHARDS) * Math.PI * 2 + 0.4;
		const d = 18 + (i % 3) * 7;
		void animate(
			shard,
			{
				x: [0, Math.cos(a) * d],
				y: [0, Math.sin(a) * d + 10],
				rotate: [0, (i % 2 ? 1 : -1) * 220],
				opacity: [1, 0],
			},
			{ duration: 0.55, ease: [0.15, 0.7, 0.3, 1] },
		).then(() => shard.remove());
	}
}

/**
 * The Horde heads-up display framing the play area: wave and combo top-left,
 * score (and the boss bar) top-centre, hull and kills top-right, owned perks
 * bottom-left. Pure presentation of `hudView(state)`; never takes input.
 */
export default function Hud(props: { state: GameState; frame: Frame }) {
	const view = createMemo(() => hudView(props.state));
	const reduced = prefersReducedMotion();

	// the combo panel lingers after a break to drain red
	const [broken, setBroken] = createSignal<HudMoments["comboBroke"]>(null);
	let breakTimer: ReturnType<typeof setTimeout> | undefined;
	const combo = () =>
		view().combo ??
		(broken()
			? {
					count: broken()?.count ?? 0,
					multiplier: 1,
					fraction: broken()?.fraction ?? 0,
					hot: false,
				}
			: null);
	let comboPanel: HTMLDivElement | undefined;
	let comboCount: HTMLDivElement | undefined;
	let comboMult: HTMLSpanElement | undefined;
	let comboFlash: HTMLDivElement | undefined;
	let comboBar: HTMLDivElement | undefined;
	const hearts: HTMLSpanElement[] = [];
	let odTag: HTMLSpanElement | undefined;
	// the overdrive tag slams in each time the streak reaches x3
	createEffect(
		on(
			() => view().overdrive,
			(now, was) => {
				// opacity stays with the class, so the tag can fade out on a break
				if (now && !was && odTag && !reduced) {
					animate(
						odTag,
						{ scale: [1.6, 1], letterSpacing: ["0.7em", "0.35em"] },
						{ type: spring, bounce: 0.35, visualDuration: 0.35 },
					);
				}
			},
		),
	);
	// the break's drain and fade, stopped if a new streak starts mid-drain
	let draining: { stop(): void }[] = [];
	function endBreak(): void {
		clearTimeout(breakTimer);
		for (const a of draining) a.stop();
		draining = [];
		setBroken(null);
		if (comboPanel) comboPanel.style.opacity = "";
	}

	onCleanup(() => clearTimeout(breakTimer));

	let prev: Parameters<typeof hudMoments>[0] = null;
	createEffect(() => {
		const s = props.state;
		const m = hudMoments(prev, s);
		prev = {
			combo: s.combo,
			playerHp: s.playerHp,
			comboTicksLeft: s.comboTicksLeft,
			perks: s.perks,
		};
		if (m.comboUp) {
			if (broken()) endBreak();
			if (comboCount && !reduced) {
				// native WAAPI: this lands on every kill, inside the keystroke, and
				// motion's setup reads computed style first
				comboCount.animate?.(
					{ scale: ["1.25", "1"] },
					{ duration: 200, easing: `cubic-bezier(${SNAP.join(",")})` },
				);
			}
		}
		if (m.tierUp) {
			if (comboMult && !reduced) {
				animate(
					comboMult,
					{ scale: [1.8, 1] },
					{ type: spring, bounce: 0.45, visualDuration: 0.35 },
				);
			}
			if (comboFlash)
				animate(comboFlash, { opacity: [0.5, 0] }, { duration: 0.5 });
		}
		if (m.comboBroke) {
			endBreak();
			setBroken(m.comboBroke);
			const from = m.comboBroke.fraction * 100;
			if (comboBar) {
				draining.push(
					animate(
						comboBar,
						{ width: [`${from}%`, "0%"] },
						{ duration: BREAK_MS / 1000 - 0.1, ease: "easeIn" },
					),
				);
			}
			if (comboPanel) {
				draining.push(
					animate(
						comboPanel,
						{ opacity: [1, 0] },
						{ delay: 0.3, duration: 0.22 },
					),
				);
			}
			breakTimer = setTimeout(endBreak, BREAK_MS);
		}
		if (m.heartLost !== null) {
			const heart = hearts[m.heartLost];
			if (heart) shatter(heart, reduced);
		}
	});

	return (
		<div class="pointer-events-none absolute inset-0 select-none">
			{/* scrims frame the top and bottom edges so the HUD has a home */}
			<div class="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-bg/55 to-transparent" />
			<div class="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-bg/70 to-transparent" />

			<div class="absolute inset-x-0 top-0 grid grid-cols-[1fr_auto_1fr] items-start gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
				{/* left: wave + combo */}
				<div class="flex flex-col items-start gap-2">
					<Show when={view().wave}>
						{(wave) => (
							<Show
								when={wave().frenzy}
								fallback={
									<span
										data-testid="game-wave"
										class={`${PANEL} px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.25em] text-text`}
									>
										{wave().label}
									</span>
								}
							>
								<span
									data-testid="wave-frenzy"
									ref={(el) =>
										queueMicrotask(() =>
											slamIn(el, { exit: false, tracking: 0.25 }),
										)
									}
									class="origin-left rounded-lg border border-error/70 bg-error/20 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.25em] text-error shadow-[0_0_18px_color-mix(in_srgb,var(--error)_45%,transparent)]"
								>
									{wave().label}
								</span>
							</Show>
						)}
					</Show>
					<Show when={combo()}>
						{(combo) => (
							<div
								ref={comboPanel}
								data-testid="game-combo"
								data-broken={broken() ? "true" : undefined}
								class={`${PANEL} relative w-40 overflow-hidden px-3 py-2 transition-[box-shadow,border-color] duration-200 sm:w-48`}
								classList={{
									"border-primary/60 shadow-[0_0_22px_color-mix(in_srgb,var(--primary)_35%,transparent)]":
										combo().hot,
									"border-error/60": !!broken(),
								}}
							>
								{/* tier-up flash */}
								<div
									ref={comboFlash}
									class="pointer-events-none absolute inset-0 bg-primary opacity-0"
								/>
								<div class="relative flex items-baseline justify-between gap-2">
									<span class={LABEL}>combo</span>
									<span
										ref={comboMult}
										class="inline-block origin-right font-display text-xl font-black tabular-nums"
										classList={{
											"text-primary": !broken(),
											"text-error": !!broken(),
											"drop-shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_80%,transparent)]":
												combo().hot,
										}}
									>
										&times;{combo().multiplier}
									</span>
								</div>
								<div
									ref={comboCount}
									class="relative origin-left font-display text-2xl font-bold leading-none tabular-nums"
									classList={{
										"text-text": !broken(),
										"text-error line-through decoration-2": !!broken(),
									}}
								>
									{combo().count}
								</div>
								<div class="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-text/10">
									<div
										ref={comboBar}
										class="h-full rounded-full"
										classList={{
											"bg-primary transition-[width] duration-100": !broken(),
											"bg-error": !!broken(),
										}}
										style={
											broken()
												? undefined
												: { width: `${combo().fraction * 100}%` }
										}
									/>
								</div>
							</div>
						)}
					</Show>
					{/* overdrive: x3 and up. Fades out when the streak breaks */}
					<span
						ref={odTag}
						data-testid="game-overdrive"
						aria-hidden={!view().overdrive}
						class="origin-left rounded-md border border-primary/70 bg-primary/20 px-2.5 py-1 font-display text-[0.7rem] font-black uppercase tracking-[0.35em] text-primary shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_55%,transparent)] transition-opacity duration-500"
						classList={{ "opacity-0": !view().overdrive }}
					>
						Overdrive
					</span>
				</div>

				{/* centre: score, then the boss life bar while a boss lives */}
				<div class="flex flex-col items-center gap-3">
					<div class="flex flex-col items-center">
						<span class={LABEL}>score</span>
						<span
							data-testid="game-score"
							class="font-display text-4xl font-black leading-tight tabular-nums text-text drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:text-5xl"
						>
							{props.state.score}
						</span>
					</div>
					<Show when={view().boss}>
						{(boss) => {
							// until the boss walks into frame the bar only warns of it
							const incoming = () => !inFrame(boss().x, boss().y, props.frame);
							return (
								<div
									data-testid="boss-bar"
									data-incoming={incoming() ? "true" : undefined}
									class={`${PANEL} flex w-[min(28rem,60vw)] flex-col gap-1.5 border-error/40 px-3 py-2 transition-opacity duration-300`}
									classList={{ "opacity-60": incoming() }}
								>
									<div class="flex items-baseline justify-between">
										<span class="font-display text-xs font-bold uppercase tracking-[0.25em] text-error">
											{boss().name}
										</span>
										<span class="font-display text-xs tabular-nums text-text-sub">
											<Show
												when={!incoming()}
												fallback={
													<span class="uppercase tracking-[0.25em] text-error motion-safe:animate-pulse">
														incoming
													</span>
												}
											>
												{boss().hp}/{boss().maxHp}
											</Show>
										</span>
									</div>
									<div class="flex gap-0.5">
										<For each={Array.from({ length: boss().maxHp })}>
											{(_, i) => (
												<div
													class="h-2 flex-1 rounded-sm"
													classList={{
														"bg-error shadow-[0_0_6px_color-mix(in_srgb,var(--error)_60%,transparent)]":
															i() < boss().hp,
														"bg-text/10": i() >= boss().hp,
													}}
												/>
											)}
										</For>
									</div>
								</div>
							);
						}}
					</Show>
				</div>

				{/* right: hull + kills */}
				<div class="flex flex-col items-end gap-2">
					<span
						data-testid="game-hp"
						class="flex gap-1 text-2xl leading-none"
						role="img"
						aria-label={`hull ${props.state.playerHp} of ${props.state.maxPlayerHp}`}
					>
						<For each={Array.from({ length: props.state.maxPlayerHp })}>
							{(_, i) => (
								<span
									ref={(el) => {
										hearts[i()] = el;
									}}
									class="relative inline-block"
									classList={{
										"text-error drop-shadow-[0_0_6px_color-mix(in_srgb,var(--error)_70%,transparent)]":
											i() < props.state.playerHp,
										"text-text-sub/50": i() >= props.state.playerHp,
									}}
								>
									{i() < props.state.playerHp ? "♥" : "♡"}
								</span>
							)}
						</For>
					</span>
					<div class="flex items-baseline gap-2">
						<span class={LABEL}>kills</span>
						<span
							data-testid="game-kills"
							class="font-display text-2xl font-bold tabular-nums text-text"
						>
							{props.state.kills}
						</span>
					</div>
				</div>
			</div>

			{/* wave-incoming banner during intermission */}
			<Show when={view().incoming}>
				{(incoming) => {
					let band: HTMLDivElement | undefined;
					return (
						<div
							ref={band}
							class="absolute inset-x-0 top-[24%] flex justify-center py-5 opacity-0"
						>
							<div class="absolute inset-0 bg-linear-to-r from-transparent via-bg/70 to-transparent" />
							<div class="absolute inset-x-[18%] top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
							<div class="absolute inset-x-[18%] bottom-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
							<div
								data-testid="wave-banner"
								ref={(el) =>
									queueMicrotask(() => slamIn(el, { exit: true, frame: band }))
								}
								class="relative pl-[0.3em] text-center font-display text-3xl font-black uppercase tracking-[0.3em] text-primary drop-shadow-[0_0_18px_color-mix(in_srgb,var(--primary)_55%,transparent)] sm:text-5xl"
							>
								{incoming()}
							</div>
						</div>
					);
				}}
			</Show>

			{/* bottom-left: owned perks, full names with a glyph */}
			<Show when={view().perkChips.length > 0}>
				<div
					data-testid="perk-strip"
					class="absolute bottom-4 left-4 flex max-w-[60vw] flex-wrap gap-2 sm:bottom-6 sm:left-8"
				>
					<For each={view().perkChips}>
						{(chip) => (
							<span
								class={`inline-flex items-center gap-2 rounded-lg border bg-bg/70 px-2.5 py-1.5 font-display text-sm font-semibold text-text backdrop-blur-sm ${chipBorder(chip.rarity)}`}
								title={chip.name}
							>
								<span
									class={`text-base leading-none ${rarityText(chip.rarity)}`}
									aria-hidden="true"
								>
									{chip.glyph}
								</span>
								{chip.name}
								<Show when={chip.count > 1}>
									<span class="tabular-nums text-text-sub">
										&times;{chip.count}
									</span>
								</Show>
							</span>
						)}
					</For>
				</div>
			</Show>

			{/* bottom-right: the one control worth reminding */}
			<div class="absolute right-4 bottom-4 hidden items-center gap-2 font-display text-xs text-text-sub sm:right-8 sm:bottom-6 sm:flex">
				<kbd class="rounded border border-text/20 bg-bg/70 px-1.5 py-0.5 text-[0.7rem] text-text">
					Esc
				</kbd>
				pause
			</div>
		</div>
	);
}
