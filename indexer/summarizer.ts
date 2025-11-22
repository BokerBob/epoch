import { flattenForSummary } from "./flattener";

const SUMMARY_MAX_CHARS = 8000;

export function firstWords(text: string, count: number): string {
    if (!text) return "";
    const words = text.split(/\s+/);
    return words.slice(0, count).join(" ");
}

export function makeSummary(text: string, n: number): string {
    if (!text) return "";
    const clipped = text.length > SUMMARY_MAX_CHARS ? text.slice(0, SUMMARY_MAX_CHARS) : text;
    const flattened = flattenForSummary(clipped);
    const words = flattened.split(/\s+/);
    if (words.length <= n) return flattened;

    return words.slice(0, n).join(" ") + "...";
}