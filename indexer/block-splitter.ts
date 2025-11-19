export function computeBlocks(lines: string[]) {
	const blocks = [];
	let start = 0;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === "") {
			if (i > start) blocks.push({ start, end: i - 1 });
			start = i + 1;
		}
	}

	if (start < lines.length) blocks.push({ start, end: lines.length - 1 });
	return blocks;
}