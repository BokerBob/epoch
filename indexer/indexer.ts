import { TFile } from "obsidian";
import { DateEntry, EpochIndex } from "./types";
import {
	parseAnyDate,
	normalizeDateFromTimestamp,
	computeBlocks
} from "./extractor";
import { makeSummary } from "./summarizer";

export class Indexer {
	index: EpochIndex = {};

	constructor(private plugin: any) {}

	async rebuild() {
		const files = this.plugin.app.vault.getFiles();

		this.index = {};

		for (const file of files) {
			await this.processFile(file);
		}

		this.index = sortIndex(this.index);
		await this.plugin.saveData({ index: this.index });
	}

	async processFile(file: TFile) {
		const content = await this.plugin.app.vault.read(file);
		const lines = content.split("\n");
		const isMd = file.extension === "md";

		const mdate = normalizeDateFromTimestamp(file.stat.mtime);
		const filenameDate = parseAnyDate(file.name);

		// blocks only for MD
		let hasBlockDates = false;
		let blockEntries: DateEntry[] = [];

		if (isMd && this.plugin.settings.parseContentDates === true) {
			const blocks = computeBlocks(lines);

			for (const b of blocks) {
				const text = lines.slice(b.start, b.end + 1).join("\n");
				const date = parseAnyDate(text);
				if (!date) continue;

				hasBlockDates = true;

				blockEntries.push({
					date,
					file: file.path,
					blockStart: b.start,
					blockEnd: b.end,
					summary: makeSummary(text, this.plugin.settings.summaryWordsCount)
				});
			}
		}

		// CASE 1: MD with block dates → only blocks
		if (hasBlockDates) {
			for (const e of blockEntries) addToIndex(this.index, e.date, e);
			return;
		}

		// CASE 2: MD/Non-MD with filename date
		if (filenameDate) {
			const entry: DateEntry = {
				date: filenameDate,
				file: file.path,
				blockStart: 0,
				blockEnd: 0,
				summary: isMd ? makeSummary(content, this.plugin.settings.summaryWordsCount) : ""
			};
			addToIndex(this.index, filenameDate, entry);
			return;
		}

		// CASE 3: fallback → mdate
		const entry: DateEntry = {
			date: mdate,
			file: file.path,
			blockStart: 0,
			blockEnd: 0,
			summary: isMd ? makeSummary(content, this.plugin.settings.summaryWordsCount) : ""
		};
		addToIndex(this.index, mdate, entry);
	}
}

// helpers

function addToIndex(index: EpochIndex, date: string, entry: DateEntry) {
	if (!index[date]) index[date] = [];

	// prevent duplicates
	if (!index[date].some(e => e.file === entry.file && e.blockStart === entry.blockStart)) {
		index[date].push(entry);
	}
}

function dateKey(d: string) {
	const [dd, mm, yyyy] = d.split("-");
	return Number(`${yyyy}${mm}${dd}`);
}

function sortIndex(index: EpochIndex): EpochIndex {
	const out: EpochIndex = {};
	const dates = Object.keys(index).sort((a, b) => dateKey(a) - dateKey(b));

	for (const d of dates) {
		out[d] = index[d].sort(
			(a, b) => a.file.localeCompare(b.file) || a.blockStart - b.blockStart
		);
	}
	return out;
}