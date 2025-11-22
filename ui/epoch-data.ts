import type { EpochIndex, DateEntry } from "../indexer/types";
import { shouldRenderEntry, entryFileName } from "./epoch-canvas-utils";

export interface DayData {
	ts: number;
	date: string;
	entries: DateEntry[];
	summary: string;
}

export function buildDayData(index: EpochIndex): DayData[] {
	const out: DayData[] = [];

	for (const date of Object.keys(index)) {
		const entries = index[date];
		if (!entries || entries.length === 0) continue;
		const visibleEntries = entries.filter(shouldRenderEntry);
		if (visibleEntries.length === 0) continue;

		const [yyyy, mm, dd] = date.split("-");
		const ts = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));

		const summary = visibleEntries
			.map(entry => {
				const trimmed = (entry.summary || "").trim();
				return trimmed || entryFileName(entry);
			})
			.filter(Boolean)
			.join(" · ");

		out.push({
			ts,
			date,
			entries: visibleEntries,
			summary
		});
	}

	out.sort((a, b) => a.ts - b.ts);
	return out;
}