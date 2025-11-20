import type { EpochIndex, DateEntry } from "../indexer/types";

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

		const [dd, mm, yyyy] = date.split("-");
		const ts = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();

		const summary = entries.map(e => e.summary).filter(Boolean).join(" · ");

		out.push({
			ts,
			date,
			entries,
			summary
		});
	}

	out.sort((a, b) => a.ts - b.ts);
	return out;
}