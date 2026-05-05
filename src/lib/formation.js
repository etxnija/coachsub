/**
 * Parse a formation string like '1-2-3-1' into rows of position slots.
 * Assumes the string encodes [GK, DEF..., MID..., FWD] from back to front.
 * Returns rows ordered top-to-bottom for display (attacking end at top).
 *
 * @param {string} formation e.g. '1-2-3-1'
 * @returns {{ type: string, positions: string[] }[]}
 */
export function parseFormation(formation) {
	const parts = formation.split('-').map(Number);

	// Label generators per row type and count
	function labels(type, count) {
		if (type === 'GK') return Array(count).fill('GK');
		if (type === 'DEF') {
			if (count === 1) return ['CB'];
			if (count === 2) return ['LB', 'RB'];
			if (count === 3) return ['LB', 'CB', 'RB'];
			return Array.from({ length: count }, (_, i) => `D${i + 1}`);
		}
		if (type === 'MID') {
			if (count === 1) return ['CM'];
			if (count === 2) return ['LM', 'RM'];
			if (count === 3) return ['LM', 'CM', 'RM'];
			return Array.from({ length: count }, (_, i) => `M${i + 1}`);
		}
		if (type === 'FWD') {
			if (count === 1) return ['F'];
			if (count === 2) return ['LF', 'RF'];
			return Array.from({ length: count }, (_, i) => `F${i + 1}`);
		}
		// Generic fallback
		return Array.from({ length: count }, (_, i) => `${type[0]}${i + 1}`);
	}

	// Determine row types from segment count
	// Common patterns:
	//   2 parts → GK, FWD
	//   3 parts → GK, MID, FWD
	//   4 parts → GK, DEF, MID, FWD
	//   5 parts → GK, DEF, DEF, MID, FWD  (uncommon, fallback)
	const typesByLength = {
		2: ['GK', 'FWD'],
		3: ['GK', 'MID', 'FWD'],
		4: ['GK', 'DEF', 'MID', 'FWD'],
		5: ['GK', 'DEF', 'DEF', 'MID', 'FWD']
	};
	const types = typesByLength[parts.length] ?? parts.map((_, i) => `ROW${i}`);

	// Build rows from back (GK) to front (FWD), then reverse for display
	const rows = parts.map((count, i) => ({
		type: types[i],
		positions: labels(types[i], count)
	}));

	// Reverse so attacking row appears at top of pitch
	return rows.reverse();
}

/**
 * Generate a unique slot ID for a formation slot.
 * @param {string} type e.g. 'MID'
 * @param {string} pos e.g. 'CM'
 * @returns {string}
 */
export function slotId(type, pos) {
	return `slot-${type}-${pos}`;
}
