import { animate, spring, stagger } from "motion";
import { For, onMount, Show } from "solid-js";
import { perkGlyph } from "@/lib/game/hud-view";
import { PERK_DEFS, type PerkId } from "@/lib/game/sim/perks";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";
import { rarityText } from "./Hud";
import { VEIL } from "./veil";

interface PerkDraftProps {
	wave: number;
	offer: readonly PerkId[];
	onPick: (index: number) => void;
}

/**
 * Between-wave perk draft: three cards picked with 1/2/3 (or a click). Rarity
 * reads at a glance: common is a quiet outline, rare a --primary outline, epic
 * a --primary to --error gradient frame with a glow.
 */
export default function PerkDraft(props: PerkDraftProps) {
	let title: HTMLDivElement | undefined;
	const cards: HTMLButtonElement[] = [];
	// the cards are dealt in one after another, flipping up onto the table
	onMount(() => {
		const reduced = prefersReducedMotion();
		if (title) {
			animate(
				title,
				reduced ? { opacity: [0, 1] } : { opacity: [0, 1], y: [-12, 0] },
				{ duration: 0.3, ease: [0.16, 1, 0.3, 1] },
			);
		}
		const dealt = cards.filter(Boolean);
		if (reduced) {
			animate(
				dealt,
				{ opacity: [0, 1] },
				{ duration: 0.25, delay: stagger(0.06) },
			);
			return;
		}
		animate(
			dealt,
			{
				opacity: [0, 1],
				y: [48, 0],
				rotateX: [55, 0],
				rotateZ: [-4, 0],
				scale: [0.88, 1],
			},
			{
				type: spring,
				bounce: 0.3,
				visualDuration: 0.42,
				delay: stagger(0.06, { startDelay: 0.08 }),
			},
		);
	});
	return (
		<div
			data-testid="perk-overlay"
			class={`absolute inset-0 z-10 grid place-items-center overflow-y-auto py-8 ${VEIL}`}
		>
			<div class="flex flex-col items-center gap-8 px-4">
				<div ref={title} class="flex flex-col items-center gap-2 text-center">
					<span class="font-display text-xs font-semibold uppercase tracking-[0.45em] text-text-sub">
						Wave {props.wave} cleared
					</span>
					<h2 class="font-display text-3xl font-black uppercase tracking-[0.2em] text-text sm:text-4xl">
						Choose an upgrade
					</h2>
				</div>
				<div class="flex flex-wrap justify-center gap-5 [perspective:900px]">
					<For each={props.offer}>
						{(id, i) => {
							const def = PERK_DEFS[id];
							const epic = def.rarity === "epic";
							return (
								<button
									ref={(el) => {
										cards[i()] = el;
									}}
									type="button"
									data-testid={`perk-card-${i()}`}
									onClick={() => props.onPick(i())}
									class="group w-64 rounded-xl text-left outline-none transition-[translate] duration-150 focus-visible:ring-2 focus-visible:ring-primary motion-safe:hover:-translate-y-1"
									classList={{
										"bg-linear-to-br from-primary via-error to-primary p-[2px] shadow-[0_0_36px_color-mix(in_srgb,var(--primary)_40%,transparent)]":
											epic,
										"border-2 border-primary/55": def.rarity === "rare",
										"border-2 border-text/15": def.rarity === "common",
									}}
								>
									<div
										class="flex h-full flex-col gap-4 bg-bg p-5"
										classList={{
											"rounded-[10px]": epic,
											"rounded-[10px] bg-bg/90": !epic,
										}}
									>
										<div class="flex items-center justify-between">
											<span
												class={`grid size-11 place-items-center rounded-lg border border-current/30 bg-text/5 text-2xl leading-none ${rarityText(def.rarity)}`}
												aria-hidden="true"
											>
												{perkGlyph(id)}
											</span>
											<kbd class="rounded-md border border-text/20 bg-text/10 px-2.5 py-1 font-display text-sm font-bold text-text">
												{i() + 1}
											</kbd>
										</div>
										<div class="flex flex-col gap-1">
											<span
												class={`font-display text-[0.65rem] font-bold uppercase tracking-[0.3em] ${rarityText(def.rarity)}`}
											>
												{def.rarity}
											</span>
											<span
												class="font-display text-xl font-bold text-text"
												data-testid="perk-card-name"
											>
												{def.name}
											</span>
										</div>
										<span class="text-sm leading-relaxed text-text/75">
											{def.desc}
										</span>
										<Show when={def.repeatable}>
											<span class="mt-auto font-display text-[0.65rem] uppercase tracking-[0.25em] text-text-sub/80">
												stacks
											</span>
										</Show>
									</div>
								</button>
							);
						}}
					</For>
				</div>
				<p class="font-display text-xs uppercase tracking-[0.3em] text-text-sub">
					press 1 · 2 · 3
				</p>
			</div>
		</div>
	);
}
