/** The part of a 2d canvas context a width lookup needs. */
type MeasuringCtx = {
	font: string;
	measureText(text: string): { width: number };
};

export type TextWidths = {
	/** Width of `text` in `font`, measured once. Leaves `c` set to `font`. */
	of(c: MeasuringCtx, font: string, text: string): number;
	/** Drop every width, e.g. once a webfont has loaded. */
	forget(): void;
	size(): number;
};

/**
 * Canvas text widths, cached by font and text. Plates and score labels redraw
 * the same few words many times, and measureText is the slow part on a
 * software rasteriser.
 */
export function createTextWidths(limit = 1024): TextWidths {
	const widths = new Map<string, number>();
	return {
		of(c, font, text) {
			c.font = font;
			const key = `${font}\n${text}`;
			let w = widths.get(key);
			if (w === undefined) {
				if (widths.size >= limit) widths.clear();
				w = c.measureText(text).width;
				widths.set(key, w);
			}
			return w;
		},
		forget: () => widths.clear(),
		size: () => widths.size,
	};
}
