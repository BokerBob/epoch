import type { EpochIndex, FileDateEntry, DateEntry } from "./types";

function dateKey(d: string) {
	const [yyyy, mm, dd] = [d.slice(0, 4), d.slice(5, 7), d.slice(8, 10)];
	return Number(`${yyyy}${mm}${dd}`);
}

export function sortIndex(index: EpochIndex): EpochIndex {
	const out: EpochIndex = {};
	const dates = Object.keys(index).sort((a, b) => dateKey(a) - dateKey(b));

	for (const d of dates) {
		const entries = index[d].slice();
		entries.sort((a, b) => {
			const weight = (entry: DateEntry) =>
				entry.source === "namedate" || entry.source === "cdate" ? 0 : 1;
			const wA = weight(a);
			const wB = weight(b);
			if (wA !== wB) return wA - wB;
			const fileCmp = a.file.localeCompare(b.file);
			if (fileCmp !== 0) return fileCmp;
			return a.blockStart - b.blockStart;
		});
		out[d] = entries;
	}
	return out;
}

export function mergeSequentialEntries(entries: FileDateEntry[]): FileDateEntry[] {
	if (entries.length === 0) return [];
	const merged: FileDateEntry[] = [];

	let current = { ...entries[0] };
	for (let i = 1; i < entries.length; i++) {
		const next = entries[i];
		if (
			next.date === current.date &&
			next.file === current.file &&
			next.source === current.source &&
			next.blockStart === current.blockEnd + 1
		) {
			current.blockEnd = next.blockEnd;
			current.summary = next.summary;
			continue;
		}
		merged.push(current);
		current = { ...next };
	}
	merged.push(current);
	return merged;
}

export function removeEntriesForFile(index: EpochIndex, path: string) {
	for (const key of Object.keys(index)) {
		const filtered = index[key].filter(entry => entry.file !== path);
		if (filtered.length) {
			index[key] = filtered;
		} else {
			delete index[key];
		}
	}
}

export function addEntries(index: EpochIndex, entries: DateEntry[]) {
	for (const entry of entries) {
		if (!index[entry.date]) index[entry.date] = [];
		index[entry.date].push(entry);
	}
}
