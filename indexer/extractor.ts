import { TFile, CachedMetadata } from "obsidian";
import { DDMap } from "./types";

const DATE_RE = /(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{4})|(\d{4}[-\/.]\d{2}[-\/.]\d{2})/;

export class Extractor {
	constructor(private app: any) {}

	extractFrontmatter(cache: CachedMetadata, dd: DDMap) {
		if (!cache.frontmatter) return;

		for (const key of Object.keys(cache.frontmatter)) {
			if (!key.startsWith("e-")) continue;

			const date = key.substring(3);
			const arr = cache.frontmatter[key] as string[];
			if (!Array.isArray(arr)) continue;

			for (const link of arr) {
				const id = this.extractBlockId(link);
				if (!id) continue;

				if (!dd[date]) dd[date] = [];
				dd[date].push(id);
			}
		}
	}

	extractDatesFromContent(lines: string[], cache: CachedMetadata, dd: DDMap) {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const m = line.match(DATE_RE);
			if (!m) continue;

			const date = this.normalizeDate(m[0]);
			const blockId = this.findBlockIdByLine(cache, i);

			if (!blockId) continue;

			if (!dd[date]) dd[date] = [];
			dd[date].push(blockId);
		}
	}

	normalizeDate(d: string): string {
		// convert dd-mm-yyyy or yyyy-mm-dd → dd-MM-yyyy
		const parts = d.includes("-") ? d.split("-") :
					  d.includes("/") ? d.split("/") :
					  d.split(".");

		if (parts[2].length === 4) {
			// dd mm yyyy
			return `${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}-${parts[2]}`;
		}

		// yyyy mm dd
		return `${parts[2].padStart(2,"0")}-${parts[1].padStart(2,"0")}-${parts[0]}`;
	}

	findBlockId(lines: string[], index: number): string | null {
		for (let i = index; i >= 0; i--) {
			const line = lines[i];
			const m = line.match(/\^([a-zA-Z0-9]{4,})/);
			if (m) return m[1];
		}
		return null;
	}

	findBlockIdByLine(cache: CachedMetadata, line: number): string | null {
		if (!cache.blocks) return null;

		for (const [id, block] of Object.entries(cache.blocks)) {
			const start = block.position.start.line;
			const end = block.position.end.line;

			if (line >= start && line <= end) {
				return id;
			}
		}

		return null;
	}

	extractBlockId(link: string): string | null {
		const m = link.match(/\^\w{4,}/);
		return m ? m[0].substring(1) : null;
	}
}
