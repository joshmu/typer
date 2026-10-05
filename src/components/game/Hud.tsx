import { createMemo, For, Show } from "solid-js";
import { hudView, type PerkChip } from "@/lib/game/hud-view";
import type { GameState } from "@/lib/game/sim/state";
import { type Frame, inFrame } from "@/lib/game/view";

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

/**
 * The Horde heads-up display framing the play area: wave and combo top-left,
 * score (and the boss bar) top-centre, hull and kills top-right, owned perks
 * bottom-left. Pure presentation of `hudView(state)`; never takes input.
 */
export default function Hud(props: { state: GameState; frame: Frame }) {
	const view = createMemo(() => hudView(props.state));

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
									class="rounded-lg border border-error/70 bg-error/20 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.25em] text-error shadow-[0_0_18px_color-mix(in_srgb,var(--error)_45%,transparent)] motion-safe:animate-pulse"
								>
									{wave().label}
								</span>
							</Show>
						)}
					</Show>
					<Show when={view().combo}>
						{(combo) => (
							<div
								data-testid="game-combo"
								class={`${PANEL} w-40 px-3 py-2 transition-[box-shadow,border-color] duration-200 sm:w-48`}
								classList={{
									"border-primary/60 shadow-[0_0_22px_color-mix(in_srgb,var(--primary)_35%,transparent)]":
										combo().hot,
								}}
							>
								<div class="flex items-baseline justify-between gap-2">
									<span class={LABEL}>combo</span>
									<span
										class="font-display text-xl font-black tabular-nums text-primary"
										classList={{
											"drop-shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_80%,transparent)]":
												combo().hot,
										}}
									>
										&times;{combo().multiplier}
									</span>
								</div>
								<div class="font-display text-2xl font-bold leading-none tabular-nums text-text">
									{combo().count}
								</div>
								<div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-text/10">
									<div
										class="h-full rounded-full bg-primary transition-[width] duration-100"
										style={{ width: `${combo().fraction * 100}%` }}
									/>
								</div>
							</div>
						)}
					</Show>
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
									class={
										i() < props.state.playerHp
											? "text-error drop-shadow-[0_0_6px_color-mix(in_srgb,var(--error)_70%,transparent)]"
											: "text-text-sub/50"
									}
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
				{(incoming) => (
					<div class="absolute inset-x-0 top-[28%] text-center font-display text-2xl font-black uppercase tracking-[0.35em] text-primary drop-shadow-[0_0_18px_color-mix(in_srgb,var(--primary)_55%,transparent)] motion-safe:animate-pulse sm:text-4xl">
						{incoming()}
					</div>
				)}
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
