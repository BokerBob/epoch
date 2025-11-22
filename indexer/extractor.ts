import * as chrono from "chrono-node";
import { flattenForDates } from "./flattener";
import { formatDate } from "utils";

function buildStrictChrono() {
	const strict = new chrono.Chrono(chrono.en.GB);

	const bannedParserClasses = new Set([
		// casual
		"ENCasualDateParser",
		"ENCasualTimeParser",
		"ENCasualYearMonthParser",

		// relative
		"ENRelativeDateFormatParser",
		"ENPrioritizeForwardRefiner",
		"ENMergeRelativeResultRefiner",
		"ENTimeUnitAgoFormatParser",
		"ENTimeUnitWithinFormatParser",

		// time expressions
		"ENTimeExpressionParser",
		"ENISOTimeExpressionParser",
		"ENTimeParser",

		// weekdays
		"ENWeekdayParser",
	]);

	const bannedRefiners = new Set([
		"ENMergeRelativeResultRefiner",
		"ENPrioritizeForwardRefiner",
		"ENCasualDateRefiner"
	]);

	strict.parsers = strict.parsers.filter(p => {
		const name = p.constructor?.name || "";
		return !bannedParserClasses.has(name);
	});

	strict.refiners = strict.refiners.filter(r => {
		const name = r.constructor?.name || "";
		return !bannedRefiners.has(name);
	});

	return strict;
}

const strictChrono = buildStrictChrono();

const ORD = "(st|nd|rd|th)";
const MONTH = "(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)";

function isLikelyDate(t: string): boolean {
	const s = t.toLowerCase();

	if (new RegExp(`\\b\\d{1,2}${ORD}\\s+${MONTH}\\s+\\d{4}\\b`).test(s)) return true;
	if (new RegExp(`\\b${MONTH}\\s+\\d{1,2}${ORD},?\\s+\\d{4}\\b`).test(s)) return true;

	if (/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/.test(s)) return true;
	if (/\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/.test(s)) return true;

	return false;
}

export function parseAnyDate(text: string): string | null {
	const flat = flattenForDates(text);
	if (!isLikelyDate(flat)) return null;

	const numericDates: Date[] = [];
	const pushDate = (year: number, month: number, day: number) => {
		if (month < 1 || month > 12) return;
		if (day < 1 || day > 31) return;
		const dt = new Date(Date.UTC(year, month - 1, day));
		if (Number.isNaN(dt.getTime())) return;
		numericDates.push(dt);
	};

	const yearFirst = /\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/g;
	let match: RegExpExecArray | null;
	while ((match = yearFirst.exec(flat))) {
		const [, y, m, d] = match;
		pushDate(Number(y), Number(m), Number(d));
	}

	const dayFirst = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/g;
	while ((match = dayFirst.exec(flat))) {
		const [, d, m, yRaw] = match;
		let year = Number(yRaw);
		if (yRaw.length === 2) year += year >= 70 ? 1900 : 2000;
		pushDate(year, Number(m), Number(d));
	}

	if (numericDates.length > 0) {
		numericDates.sort((a, b) => a.getTime() - b.getTime());
		return formatDate(numericDates[0]);
	}

	const parsed = strictChrono.parse(flat);
	if (parsed.length === 0) return null;

	let earliest: Date | null = null;
	for (const res of parsed) {
		const d = res.start?.date();
		if (!d) continue;
		if (!earliest || d < earliest) {
			earliest = d;
		}
	}

	return earliest ? formatDate(earliest) : null;
}

export function normalizeDateFromTimestamp(ts: number): string {
	return formatDate(new Date(ts));
}

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