import type { DateEntry } from "../indexer/types";

export function truncate(
	text: string,
	maxWidth: number,
	ctx: CanvasRenderingContext2D
): string {
	if (!text) return "";
	if (ctx.measureText(text).width <= maxWidth) return text;
	const ell = "...";
	const dot = text.lastIndexOf(".");
	const suffix = dot > 0 ? text.slice(dot) : "";

	const ensureSuffixFits = (value: string): string => {
		if (!suffix) return value;
		let suffixText = suffix;
		if (ctx.measureText(value).width <= maxWidth) return value;
		if (ctx.measureText(ell + suffix).width <= maxWidth) {
			return ell + suffix;
		}
		while (suffixText.length > 1 && ctx.measureText(suffixText).width > maxWidth) {
			suffixText = suffixText.slice(1);
		}
		return suffixText;
	};

	if (!suffix) {
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

	const base = text.slice(0, dot);
	if (ctx.measureText(ell + suffix).width > maxWidth) {
		return ensureSuffixFits(suffix);
	}

	let low = 0;
	let high = base.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		const candidate = base.slice(0, mid) + ell + suffix;
		if (ctx.measureText(candidate).width <= maxWidth) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}
	const len = Math.max(0, low - 1);
	const candidate = base.slice(0, len) + ell + suffix;
	if (ctx.measureText(candidate).width <= maxWidth) {
		return candidate;
	}
	return ensureSuffixFits(candidate);
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

export function withFontWeight(font: string, weight: string): string {
	const parsed = parseFontSize(font);
	const rest = parsed.rest.trimStart();
	const weightPattern = /^(thin|extra-light|ultra-light|light|normal|regular|medium|semi-bold|demi-bold|bold|extra-bold|ultra-bold|heavy|black|[1-9]00)\b/i;
	let remainder = rest;
	if (weightPattern.test(rest)) {
		const firstSpace = rest.indexOf(" ");
		remainder = firstSpace >= 0 ? rest.slice(firstSpace + 1) : "";
	}
	return `${weight} ${parsed.size}px${remainder ? " " + remainder : ""}`.trimEnd();
}

export function shouldRenderEntry(entry: DateEntry): boolean {
	if (!entry) return false;
	return true;
}

export function entryFileName(entry: DateEntry): string {
	if (!entry) return "";
	const parts = entry.file?.split?.("/") ?? [];
	if (parts.length === 0) return entry.file || "";
	return parts[parts.length - 1] || entry.file;
}
