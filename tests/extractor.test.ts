import { describe, it, expect } from "vitest";

import { parseAnyDate, normalizeDateFromTimestamp, computeBlocks } from "../indexer/extractor";
import { flattenForSummary } from "../indexer/flattener";

describe("DATE PARSING", () => {

    	it("parses '12th November 2025'", () => {
		const r = parseAnyDate("Meet on 12th November 2025");
		expect(r).toBe("2025-11-12");
	});

	it("parses 'November 12th, 2025'", () => {
		const r = parseAnyDate("Event: November 12th, 2025");
		expect(r).toBe("2025-11-12");
	});

	it("parses ambiguous slash 12/11/2025 as D/M/Y", () => {
		const r = parseAnyDate("Date: 12/11/2025");
		expect(r).toBe("2025-11-12");
	});

	it("extracts simple date", () => {
		const r = parseAnyDate("Event on 8/11/2025");
		expect(r).toBe("2025-11-08");
	});

    it("extracts simple date", () => {
		const r = parseAnyDate("Event on 03.4.2025");
		expect(r).toBe("2025-04-03");
	});

	it("ignores '6000 years ago'", () => {
		const r = parseAnyDate("Humans lived 6000 years ago");
		expect(r).toBe(null);
	});

	it("ignores fractional like 8/10", () => {
		const r = parseAnyDate("Handstand 8/10 times");
		expect(r).toBe(null);
	});

	it("ignores ranges 4–5", () => {
		const r = parseAnyDate("Warmup 4–5 reps");
		expect(r).toBe(null);
	});

	it("ignores time-like 02:00", () => {
		const r = parseAnyDate("At 02:00 focus");
		expect(r).toBe(null);
	});

	it("filename date parsing", () => {
		const r = parseAnyDate("Log_2025-10-31.md");
		expect(r).toBe("2025-10-31");
	});

	it("timestamp formatting", () => {
		const d = new Date(2025, 10, 20); // 20 Nov 2025
		const r = normalizeDateFromTimestamp(+d);
		expect(r).toBe("2025-11-20");
	});

	it("no false positives in big texts", () => {
		const txt = `
			Test with 10–15° angle,
			6–8 hours of work,
			and sometimes 02:00 in the morning.
		`;
		const r = parseAnyDate(txt);
		expect(r).toBe(null);
	});
});


describe("SUMMARY / URL CLEANING", () => {

	it("removes MD formatting", () => {
		const r = flattenForSummary("**Bold** _italic_ text");
		expect(r).toBe("Bold italic text");
	});

	it("shortens raw URL with query", () => {
		const r = flattenForSummary("https://youtu.be/abcd1234xyz?si=AAA");
		expect(r).toBe("youtu.be/abcd1234xyz...");
	});

	it("removes trailing slash", () => {
		const r = flattenForSummary("https://google.com/search/");
		expect(r).toBe("google.com/search");
	});

	it("removes http/https/www", () => {
		const r = flattenForSummary("www.example.com/path");
		expect(r).toBe("example.com/path");
	});

	it("shortens markdown links", () => {
		const r = flattenForSummary("[Open](https://youtu.be/abcd1234xyz?ref=abc)");
		expect(r).toBe("Open youtu.be/abcd1234xyz...");
	});

	it("removes Obsidian images", () => {
		const r = flattenForSummary("Hello ![[img.png]] world");
		expect(r).toBe("Hello world");
	});

	it("removes punctuation outside links", () => {
		const r = flattenForSummary("Check: https://example.com/a-b-c?x=1.");
		expect(r).toBe("Check example.com/a-b-c...");
	});

    it("removes numbers and quotes and brackets", () => {
		const r = flattenForSummary("Check: 1.5 **(\"mâthi-môs\")**");
		expect(r).toBe("Check 1.5 mâthi-môs");
	});
});

describe("BLOCK DETECTION", () => {

	it("computes blocks separated by empty lines", () => {
		const lines = [
			"Line A",
			"Line B",
			"",
			"Line C",
			"Line D",
			"",
			"Line E"
		];

		const r = computeBlocks(lines);

		expect(r).toEqual([
			{ start: 0, end: 1 },
			{ start: 3, end: 4 },
			{ start: 6, end: 6 },
		]);
	});
});
