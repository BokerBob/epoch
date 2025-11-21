export function truncate(
	text: string,
	maxWidth: number,
	ctx: CanvasRenderingContext2D
): string {
	if (!text) return "";
	if (ctx.measureText(text).width <= maxWidth) return text;
	const ell = "...";
	let low = 0;
	let high = text.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		const candidate = text.slice(0, mid) + ell;
		if (ctx.measureText(candidate).width <= maxWidth) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}
	const len = Math.max(0, low - 1);
	return text.slice(0, len) + ell;
}

export function dist(a: Touch, b: Touch): number {
	const dx = a.clientX - b.clientX;
	const dy = a.clientY - b.clientY;
	return Math.hypot(dx, dy);
}

export function mid(a: Touch, b: Touch): { x: number; y: number } {
	return {
		x: (a.clientX + b.clientX) / 2,
		y: (a.clientY + b.clientY) / 2
	};
}

export function parseFontSize(font: string): { size: number; rest: string } {
	const m = font.match(/^\s*(\d+(?:\.\d+)?)px(.*)$/);
	if (!m) return { size: 12, rest: font };
	return { size: parseFloat(m[1]), rest: m[2] };
}

export function mixFont(base: string, hover: string, t: number): string {
	const b = parseFontSize(base);
	const h = parseFontSize(hover || base);
	const size = b.size + (h.size - b.size) * t;
	return `${size.toFixed(2)}px${b.rest}`;
}
