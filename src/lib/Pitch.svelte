<script>
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { slotId } from '$lib/formation.js';

	/**
	 * @typedef {{ id: string, position: string, type: string, items: any[] }} PitchSlot
	 * @typedef {{ type: string, positions: string[] }} FormationRow
	 */

	/** @type {PitchSlot[]} */
	export let slots = [];
	/** @type {FormationRow[]} */
	export let formationRows = [];
	/** @type {Set<string>} */
	export let groupASet = new Set();
	/** Flip animation duration in ms */
	export let flipMs = 150;
	/** CSS transform applied to pitch content — used for orientation rotation in game view */
	export let transform = '';
	/** Called when a slot's dndzone fires consider. If null, group toggle buttons are hidden. */
	/** @type {(sid: string, e: CustomEvent) => void} */
	export let onConsider;
	/** @type {(sid: string, e: CustomEvent) => void} */
	export let onFinalize;
	/** If provided, shows an A/B toggle badge on each slot. @type {((sid: string) => void) | null} */
	export let onGroupToggle = null;
</script>

<!--
	Half-pitch: shows only our half (center line → our goal).
	Parent controls sizing via a wrapper div with flex-1 / min-h-0.
	This component fills 100% of its parent.
-->
<div class="relative h-full w-full overflow-hidden rounded-2xl bg-green-700">
	<!-- Inner wrapper handles orientation transform (game view rotation) -->
	<div
		class="absolute inset-0"
		style="transform: {transform}; transform-origin: center center; transition: transform 0.3s ease"
	>
		<!--
			Half-pitch SVG: viewBox shows y=58→136 of the 90×130 coordinate space.
			Only our half is visible (center line at top, our goal at bottom).
			preserveAspectRatio="none" fills the container without letterboxing.
		-->
		<svg
			class="absolute inset-0 h-full w-full"
			viewBox="0 58 90 78"
			preserveAspectRatio="none"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<!-- Center line (top boundary of our half) -->
			<line x1="2" y1="65" x2="88" y2="65" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" />
			<!-- Center circle arc (partially visible) -->
			<circle cx="45" cy="65" r="12" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
			<!-- Left touch line -->
			<line x1="2" y1="65" x2="2" y2="128" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" />
			<!-- Right touch line -->
			<line x1="88" y1="65" x2="88" y2="128" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" />
			<!-- Goal line -->
			<line x1="2" y1="128" x2="88" y2="128" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" />
			<!-- Our penalty area -->
			<rect x="20" y="108" width="50" height="20" stroke="rgba(255,255,255,0.35)" stroke-width="1" />
			<!-- Our goal -->
			<rect x="33" y="126" width="24" height="6" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" />
		</svg>

		<!-- Formation rows: FWD at top (near center), GK at bottom (near our goal) -->
		<div class="absolute inset-0 flex flex-col justify-around py-3">
			{#each formationRows as row}
				<div class="flex justify-around px-1">
					{#each row.positions as pos}
						{@const pitchSlot = slots.find((s) => s.id === slotId(row.type, pos))}
						{#if pitchSlot}
							{@const isGK = pitchSlot.type === 'GK'}
							{@const isGroupA = !isGK && groupASet.has(pitchSlot.id)}
							<div class="relative h-14 w-[3.25rem]">
								<!-- DnD zone fills the slot wrapper -->
								<div
									use:dndzone={{
										items: pitchSlot.items,
										flipDurationMs: flipMs,
										dropTargetStyle: {}
									}}
									on:consider={(e) => onConsider(pitchSlot.id, e)}
									on:finalize={(e) => onFinalize(pitchSlot.id, e)}
									class="absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 transition-colors {pitchSlot
										.items.length > 0
										? isGK
											? 'border-gray-400/60'
											: isGroupA
												? 'border-orange-400/60'
												: 'border-teal-500/60'
										: isGK
											? 'border-dashed border-gray-400/50 bg-white/5'
											: isGroupA
												? 'border-dashed border-orange-400/70 bg-white/10'
												: 'border-dashed border-teal-400/70 bg-white/10'}"
								>
									{#each pitchSlot.items as chip (chip.id)}
										<div
											animate:flip={{ duration: flipMs }}
											class="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white px-1 shadow-md"
										>
											<!-- Parent provides chip content via named slot -->
											<slot name="chip" {chip} {isGroupA} {isGK} {pitchSlot} />
										</div>
									{/each}
									{#if pitchSlot.items.length === 0}
										<span class="text-[10px] font-semibold {isGK ? 'text-gray-300' : isGroupA ? 'text-orange-200' : 'text-teal-200'}">{pos}</span>
									{/if}
								</div>

								<!-- A/B toggle: only shown for non-GK slots when onGroupToggle is provided -->
								{#if onGroupToggle && !isGK}
									<button
										on:click|stopPropagation={() => onGroupToggle && onGroupToggle(pitchSlot.id)}
										class="absolute right-0.5 top-0.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-white/50 text-[8px] font-bold text-white shadow {isGroupA
											? 'bg-orange-400'
											: 'bg-teal-500'}"
										aria-label="Toggle group"
									>{isGroupA ? 'A' : 'B'}</button>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>
