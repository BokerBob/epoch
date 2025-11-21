import { TFile } from "obsidian";
import { DateEntry, EpochIndex } from "./types";
import {
	parseAnyDate,
	normalizeDateFromTimestamp,
	computeBlocks
} from "./extractor";
import { makeSummary } from "./summarizer";
import { sortIndex } from "./indexer-utils";

export class Indexer {
	index: EpochIndex = {};

	constructor(private plugin: any) {}

	private shouldGenerateSummary(isMd: boolean): boolean {
		return isMd && this.plugin.settings.generateSummaries === true;
	}

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
		const isMd = file.extension === "md";
		const isAttachment = !isMd;

		if (isAttachment && this.plugin.settings.showAttachments === false) {
			return;
		}

		const content = isMd
			? await this.plugin.app.vault.read(file)
			: "";
		const lines = isMd ? content.split("\n") : [];

		const mdate = normalizeDateFromTimestamp(file.stat.mtime);

		const parseDates = this.plugin.settings.parseDates === true;

		// CASE 1: MD + parseDates → пробуємо витягнути дати з контенту
		let hasBlockDates = false;
		let blockEntries: DateEntry[] = [];

		if (isMd && parseDates) {
			const blocks = computeBlocks(lines);

			for (const b of blocks) {
				const text = lines.slice(b.start, b.end + 1).join("\n");
				const date = parseAnyDate(text);
				if (!date) continue;

				hasBlockDates = true;

				const summary = this.shouldGenerateSummary(true)
					? makeSummary(text, this.plugin.settings.summaryWordsCount)
					: "";

				blockEntries.push({
					date,
					file: file.path,
					blockStart: b.start,
					blockEnd: b.end,
					summary
				});
			}
		}

		if (hasBlockDates) {
			for (const e of blockEntries) addToIndex(this.index, e.date, e);
			return;
		}

		// CASE 2: parseDates → пробуємо дату з імені файла
		let filenameDate: string | null = null;
		if (parseDates) {
			filenameDate = parseAnyDate(file.name);
		}

		if (filenameDate) {
			const summary = this.shouldGenerateSummary(isMd)
				? makeSummary(content, this.plugin.settings.summaryWordsCount)
				: "";

			const entry: DateEntry = {
				date: filenameDate,
				file: file.path,
				blockStart: 0,
				blockEnd: 0,
				summary
			};
			addToIndex(this.index, filenameDate, entry);
			return;
		}

		// CASE 3: fallback → mdate
		const summary = this.shouldGenerateSummary(isMd)
			? makeSummary(content, this.plugin.settings.summaryWordsCount)
			: "";

		const entry: DateEntry = {
			date: mdate,
			file: file.path,
			blockStart: 0,
			blockEnd: 0,
			summary
		};
		addToIndex(this.index, mdate, entry);
	}
}

// helpers

function addToIndex(index: EpochIndex, date: string, entry: DateEntry) {
	if (!index[date]) index[date] = [];

	const arr = index[date];

	if (arr.length > 0) {
		const last = arr[arr.length - 1];
		const lastStart = last.blockStart ?? 0;
		const lastEnd = last.blockEnd ?? lastStart;
		const newStart = entry.blockStart ?? 0;

		if (last.file === entry.file && newStart === lastEnd + 1) {
			const newEnd = entry.blockEnd ?? entry.blockStart ?? newStart;
			last.blockEnd = Math.max(lastEnd, newEnd);
			return;
		}
	}

	if (!arr.some(e => e.file === entry.file && e.blockStart === entry.blockStart)) {
		arr.push(entry);
	}
}