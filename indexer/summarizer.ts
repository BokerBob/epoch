import { flattenForSummary } from "./flattener";

export function firstWords(text: string, count: number): string {
	if (!text) return "";
	const words = text.split(/\s+/);
	return words.slice(0, count).join(" ");
}

export function makeSummary(text: string, n: number): string {
    const f = flattenForSummary(text);
    const words = f.split(/\s+/);
    if (words.length <= n) return f;

    return words.slice(0, n).join(" ") + "...";
}