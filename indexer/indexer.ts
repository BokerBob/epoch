import { TFile } from "obsidian";
import {
	BlockSnapshot,
	DateEntry,
	DateSource,
	EpochIndex,
	FileDateEntry,
	FileIndexData,
	SerializedEpochIndex,
	StoredFileIndexData
} from "./types";
import {
	parseAnyDate,
	normalizeDateFromTimestamp,
	computeBlocks
} from "./extractor";
import { makeSummary } from "./summarizer";
import { addEntries, removeEntriesForFile, sortIndex } from "./indexer-utils";
import { formatDate } from "utils";

interface ProcessOptions {
	skipTrackedUpdate?: boolean;
	reason?: "rebuild" | "modify" | "track" | "create";
	previous?: FileIndexData;
}

function createEmptyFileIndex(): FileIndexData {
	return {
		cdate: null,
		namedDate: null,
		contentDates: [],
		trackedDates: {},
		blockSnapshot: []
	};
}

export class Indexer {
	index: EpochIndex = {};
	private files: Record<string, FileIndexData> = {};

	constructor(private plugin: any) {}

	async load(serialized: SerializedEpochIndex | undefined) {
		if (serialized?.files && serialized?.dates) {
			const normalized: Record<string, FileIndexData> = {};
			for (const [path, data] of Object.entries(serialized.files)) {
				normalized[path] = this.normalizeFileIndexData(data);
			}
			this.files = normalized;
			this.index = sortIndex(serialized.dates);
		} else {
			this.files = {};
			this.index = {};
		}
	}

	toJSON(): SerializedEpochIndex {
		return {
			files: this.files,
			dates: sortIndex(this.index)
		};
	}

	async rebuildAll(files: TFile[], onProgress?: (processed: number, total: number) => void) {
		const previousFiles = this.files;
		this.files = {};
		this.index = {};
		const total = files.length;
		let processed = 0;
		for (const file of files) {
			await this.processFile(file, {
				skipTrackedUpdate: true,
				reason: "rebuild",
				previous: previousFiles[file.path]
			});
			processed++;
			onProgress?.(processed, total);
		}
		this.index = sortIndex(this.index);
	}

	async processFile(file: TFile, options: ProcessOptions = {}) {
		const isMd = file.extension === "md";
		const includeAttachments = this.plugin.settings.showAttachments === true;

		if (!isMd && !includeAttachments) {
			this.removeFile(file.path);
			return;
		}

		const previousData = options.previous ?? this.files[file.path] ?? createEmptyFileIndex();
		const previousSnapshot = previousData.blockSnapshot ?? [];
		const fileData: FileIndexData = {
			cdate: null,
			namedDate: null,
			contentDates: [],
			trackedDates: this.cloneTrackedDates(previousData.trackedDates),
			blockSnapshot: previousSnapshot
		};

		const content = isMd ? await this.plugin.app.vault.read(file) : "";
		const lines = isMd ? content.split(/\r?\n/) : [];

		fileData.cdate = this.buildFileDateEntry(
			file,
			lines,
			normalizeDateFromTimestamp(file.stat.mtime),
			isMd,
			"cdate"
		);

		fileData.namedDate = this.buildNamedDateEntry(file, lines, isMd);

		if (this.plugin.settings.parseContentDates && isMd) {
			fileData.contentDates = this.buildContentDates(file, lines);
		} else {
			fileData.contentDates = [];
		}

		if (this.plugin.settings.trackChanges && isMd && !options.skipTrackedUpdate) {
			this.updateTrackedDates(file, fileData, lines, previousSnapshot);
		}

		if (!isMd) {
			fileData.trackedDates = {};
		}

		fileData.blockSnapshot = this.buildBlockSnapshot(lines);

		this.files[file.path] = fileData;
		this.updateAggregatedEntries(file.path);
	}

	removeFile(path: string) {
		delete this.files[path];
		removeEntriesForFile(this.index, path);
	}

	async renameFile(oldPath: string, newPath: string) {
		if (oldPath === newPath) return;

		const previous = this.files[oldPath];
		if (previous) {
			this.updateFileIndexPath(previous, newPath);
			delete this.files[oldPath];
		}

		removeEntriesForFile(this.index, oldPath);

		const abstract = this.plugin.app.vault.getAbstractFileByPath(newPath);
		if (abstract instanceof TFile) {
			await this.processFile(abstract, {
				reason: "modify",
				skipTrackedUpdate: true,
				previous: previous
			});
			return;
		}

		if (previous) {
			this.files[newPath] = previous;
			this.updateAggregatedEntries(newPath);
		} else {
			this.index = sortIndex(this.index);
		}
	}

	private updateFileIndexPath(data: FileIndexData, newPath: string) {
		if (data.cdate) data.cdate.file = newPath;
		if (data.namedDate) data.namedDate.file = newPath;
		for (const entry of data.contentDates) entry.file = newPath;
		for (const dateKey of Object.keys(data.trackedDates)) {
			for (const entry of data.trackedDates[dateKey]) entry.file = newPath;
		}
	}

	private buildFileDateEntry(
		file: TFile,
		lines: string[],
		date: string,
		isMd: boolean,
		source: DateSource
	): FileDateEntry {
		const text = isMd ? lines.join("\n") : "";
		const summary = text
			? this.resolveSummaryForFile(file.path, text)
			: this.getFileNameFromPath(file.path);
		return {
			date,
			file: file.path,
			blockStart: 0,
			blockEnd: Math.max(0, lines.length - 1),
			summary,
			source
		};
	}

	private buildNamedDateEntry(file: TFile, lines: string[], isMd: boolean): FileDateEntry | null {
		const parsed = parseAnyDate(file.basename);
		if (!parsed) return null;
		return this.buildFileDateEntry(file, lines, parsed, isMd, "namedate");
	}

	private buildContentDates(file: TFile, lines: string[]): FileDateEntry[] {
		const blocks = computeBlocks(lines);
		const entries: FileDateEntry[] = [];

		for (const block of blocks) {
			const text = this.extractText(lines, block.start, block.end);
			if (!text.trim()) continue;
			const date = parseAnyDate(text);
			if (!date) continue;
			entries.push({
				date,
				file: file.path,
				blockStart: block.start,
				blockEnd: block.end,
				summary: this.resolveSummaryForFile(file.path, text),
				source: "content"
			});
		}

		return this.mergeConsecutive(entries, lines);
	}

	private updateTrackedDates(
		file: TFile,
		data: FileIndexData,
		lines: string[],
		previousSnapshot: BlockSnapshot[]
	) {
		const today = formatDate(this.today());
		const blocks = computeBlocks(lines);
		const previousMap = new Map(
			previousSnapshot.map(item => [`${item.start}:${item.end}`, item])
		);
		const entries: FileDateEntry[] = [];

		for (const block of blocks) {
			const text = this.extractText(lines, block.start, block.end);
			if (!text.trim()) continue;
			const key = `${block.start}:${block.end}`;
			const hash = this.hashText(text);
			const previous = previousMap.get(key);
			if (previous && previous.hash === hash) continue;
			entries.push({
				date: today,
				file: file.path,
				blockStart: block.start,
				blockEnd: block.end,
				summary: this.resolveSummaryForFile(file.path, text),
				source: "tracked"
			});
		}

		if (entries.length === 0) return;

		const existing = data.trackedDates[today] ?? [];

		const shouldMerge = (a: FileDateEntry, b: FileDateEntry) => {
			return (
				a.blockStart <= b.blockEnd + 1 &&
				b.blockStart <= a.blockEnd + 1
			);
		};

		const retained = existing.filter(existingEntry =>
			entries.every(newEntry => !shouldMerge(existingEntry, newEntry))
		);

		const combined = [...retained, ...entries].sort(
			(a, b) => a.blockStart - b.blockStart
		);

		data.trackedDates[today] = this.mergeConsecutive(combined, lines);
	}

	private mergeConsecutive(entries: FileDateEntry[], lines: string[]): FileDateEntry[] {
		if (entries.length === 0) return [];
		const sorted = entries.slice().sort((a, b) => a.blockStart - b.blockStart);
		const merged: FileDateEntry[] = [];
		let current = { ...sorted[0] };

		for (let i = 1; i < sorted.length; i++) {
			const next = sorted[i];
			if (
				next.date === current.date &&
				next.file === current.file &&
				next.source === current.source
			) {
				current.blockEnd = Math.max(current.blockEnd, next.blockEnd);
			} else {
				const summary = this.resolveSummary(
					current,
					this.extractText(lines, current.blockStart, current.blockEnd)
				);
				merged.push({ ...current, summary });
				current = { ...next };
			}
		}

		const summary = this.resolveSummary(
			current,
			this.extractText(lines, current.blockStart, current.blockEnd)
		);
		merged.push({ ...current, summary });
		return merged;
	}

	private buildBlockSnapshot(lines: string[]): BlockSnapshot[] {
		const blocks = computeBlocks(lines);
		return blocks.map(b => {
			const text = this.extractText(lines, b.start, b.end);
			return {
				start: b.start,
				end: b.end,
				hash: this.hashText(text),
				text: text.slice(0, 2000)
			};
		});
	}

	private updateAggregatedEntries(filePath: string) {
		removeEntriesForFile(this.index, filePath);

		const data = this.files[filePath];
		if (!data) {
			this.index = sortIndex(this.index);
			return;
		}

		const mergedDates = this.buildMergedDates(data);
		const entries: DateEntry[] = [];

		const anchorEntry = data.namedDate ?? data.cdate ?? null;

		if (mergedDates.length === 0) {
			if (anchorEntry) entries.push(anchorEntry);
		} else {
			entries.push(...mergedDates);
			if (
				anchorEntry &&
				!mergedDates.some(e => e.date === anchorEntry.date && e.file === anchorEntry.file)
			) {
				entries.push(anchorEntry);
			}
		}

		addEntries(this.index, entries);
		this.index = sortIndex(this.index);
	}

	private normalizeFileIndexData(data: StoredFileIndexData): FileIndexData {
		const tracked = this.cloneTrackedDates(data.trackedDates);
		const cdate = data.cdate ?? data.mdate ?? null;
		const namedDate = data.namedDate ?? null;
		const content = Array.isArray(data.contentDates)
			? data.contentDates.map(entry => ({ ...entry }))
			: [];
		const snapshot = Array.isArray(data.blockSnapshot)
			? data.blockSnapshot.map(block => ({ ...block }))
			: [];
		return {
			cdate: cdate ? { ...cdate } : null,
			namedDate: namedDate ? { ...namedDate } : null,
			contentDates: content,
			trackedDates: tracked,
			blockSnapshot: snapshot
		};
	}

	private buildMergedDates(data: FileIndexData): FileDateEntry[] {
		const content = data.contentDates ?? [];
		const tracked: FileDateEntry[] = [];
		if (this.plugin.settings.trackChanges) {
			for (const dateKey of Object.keys(data.trackedDates)) {
				tracked.push(...data.trackedDates[dateKey]);
			}
		}

		const contentDates = new Set(content.map(entry => entry.date));
		const filteredTracked = tracked.filter(entry => !contentDates.has(entry.date));

		const combined = [...content, ...filteredTracked].filter(entry =>
			(entry.summary || "").trim().length > 0
		);

		return combined.sort((a, b) => a.blockStart - b.blockStart);
	}

	private extractText(lines: string[], start: number, end: number): string {
		if (lines.length === 0) return "";
		const slice = lines.slice(start, end + 1);
		return slice.join("\n").trim();
	}

	private maybeSummarize(text: string): string {
		if (!text) return "";
		const words = Math.max(0, this.plugin.settings.summaryWordsCount ?? 0);
		if (words <= 0) return "";
		return makeSummary(text, words);
	}

	private resolveSummaryForFile(path: string, text: string): string {
		const raw = this.maybeSummarize(text).trim();
		if (raw) return raw;
		return this.getFileNameFromPath(path);
	}

	private resolveSummary(entry: FileDateEntry, text: string): string {
		return this.resolveSummaryForFile(entry.file, text);
	}

	private getFileNameFromPath(path: string): string {
		if (!path) return "";
		const idx = path.lastIndexOf("/");
		return idx >= 0 ? path.slice(idx + 1) : path;
	}

	private today(): Date {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}

	private hashText(text: string): string {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
		}
		return hash.toString(16);
	}

	private cloneTrackedDates(source?: Record<string, FileDateEntry[]>): Record<string, FileDateEntry[]> {
		if (!source) return {};
		const clone: Record<string, FileDateEntry[]> = {};
		for (const key of Object.keys(source)) {
			clone[key] = source[key].map(entry => ({ ...entry }));
		}
		return clone;
	}
}