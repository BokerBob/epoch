import * as chrono from "chrono-node";

const DATE_HINT =
	/\b(\d{1,2}[-\/._]\d{1,2}[-\/._]\d{2,4}|\d{4}[-\/._]\d{1,2}[-\/._]\d{1,2})\b/;

const MONTH_ONLY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;
const MONTH_WITH_DAY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/i;

function normalize(d: Date): string {
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yyyy = d.getFullYear();
	return `${dd}-${mm}-${yyyy}`;
}

export function parseAnyDate(text: string): string | null {
	const hasNumeric = DATE_HINT.test(text);
	const hasMonth = MONTH_WITH_DAY.test(text);

	if (!hasNumeric && !hasMonth) return null;

	const d = chrono.parseDate(text);
	if (!d) return null;

	return normalize(d);
}

export function findDateInText(raw: string): string | null {
	if (!raw) return null;

	// Remove links first (dates inside links = forbidden)
	let text = raw
		.replace(/!\[\[.*?\]\]/g, " ")
		.replace(/\[\[.*?\]\]/g, " ")
		.replace(/\[[^\]]*]\([^)]*\)/g, " ")
		.replace(/https?:\/\/\S+/g, " ");

	text = text.trim();
	if (!text) return null;

	// Strict regexes for FULL dates only
	const patterns = [
		/\b(\d{2})[-./](\d{2})[-./](\d{4})\b/,                       // 14-12-2025, 14/12/2025, 14.12.2025
		/\b(\d{4})[-./](\d{2})[-./](\d{2})\b/,                       // 2025-12-14
		/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i, // 14 Dec 2025
		/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i // Dec 14 2025
	];

	for (let p of patterns) {
		const m = text.match(p);
		if (!m) continue;

		let dd, mm, yyyy;

		// dd-mm-yyyy or dd/mm/yyyy
		if (m.length === 4 && /^\d{2}$/.test(m[1])) {
			dd = m[1];
			mm = m[2];
			yyyy = m[3];
		}

		// yyyy-mm-dd
		else if (m.length === 4 && /^\d{4}$/.test(m[1])) {
			yyyy = m[1];
			mm = m[2];
			dd = m[3];
		}

		// 14 Dec 2025
		else if (m.length === 4 && isNaN(Number(m[2]))) {
			dd = m[1].padStart(2, "0");
			mm = monthToNumber(m[2]);
			yyyy = m[3];
		}

		// Dec 14 2025
		else if (m.length === 4 && isNaN(Number(m[1]))) {
			mm = monthToNumber(m[1]);
			dd = m[2].padStart(2, "0");
			yyyy = m[3];
		}

		// Normalize output to dd-MM-yyyy
		return `${dd}-${mm}-${yyyy}`;
	}

	return null;
}

function monthToNumber(m: string): string {
	const map: Record<string,string> = {
		jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06",
		jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12"
	};
	return map[m.toLowerCase()] ?? "01";
}

export const findDateInFilename = parseAnyDate;

export function normalizeDateFromTimestamp(ts: number): string {
	const d = new Date(ts);
	return normalize(d);
}