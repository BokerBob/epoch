function dateKey(d: string) {
	const [dd, mm, yyyy] = d.split("-");
	return Number(`${yyyy}${mm}${dd}`);
}

export function removeFileFromIndex(index: EpochIndex, path: string) {
	for (const key in index) {
		index[key] = index[key].filter(e => e.file !== path);
		if (index[key].length === 0) delete index[key];
	}
}

export function renameFileInIndex(index: EpochIndex, oldPath: string, newPath: string) {
	for (const key in index) {
		for (const e of index[key]) {
			if (e.file === oldPath) e.file = newPath;
		}
	}
}

export function sortIndex(index: EpochIndex): EpochIndex {
	const out: EpochIndex = {};
	const dates = Object.keys(index).sort((a, b) => dateKey(a) - dateKey(b));

	for (const d of dates) {
		out[d] = index[d].sort(
			(a, b) => a.file.localeCompare(b.file) || a.blockStart - b.blockStart
		);
	}
	return out;
}
