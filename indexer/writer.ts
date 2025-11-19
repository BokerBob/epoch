import { DateEntry } from "./types";
import { TFile } from "obsidian";

export class Writer {
	constructor(private app: any) {}

	async write(file: TFile, entries: DateEntry[]) {
		await this.app.fileManager.processFrontMatter(file, fm => {
			for (const k of Object.keys(fm)) {
				if (k.startsWith("e-")) delete fm[k];
			}

			for (const e of entries) {
				const k = `e-${e.date}`;
				if (!fm[k]) fm[k] = [];
				fm[k].push(`[[#^${e.blocks[0]}|${e.summary}]]`);
			}
		});
	}
}