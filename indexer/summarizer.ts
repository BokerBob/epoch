// Remove markdown, links, embeds, lists, headings, bold, italic
export function flatten(text: string): string {
	return text
		// remove images ![[...]]
		.replace(/!\[\[.*?\]\]/g, " ")
		// remove wiki links [[...]]
		.replace(/\[\[[^\]]+]]/g, " ")
		// remove markdown [text](url)
		.replace(/\[[^\]]*]\([^)]*\)/g, " ")
		// remove raw URLs (http/https)
		.replace(/https?:\/\/\S+/g, " ")
		// remove inline code
		.replace(/`[^`]+`/g, " ")
		// headings
		.replace(/#+\s+/g, " ")
		// lists
		.replace(/^\s*[-*+]\s+/gm, " ")
		// blockquotes
		.replace(/^>\s+/gm, " ")
		// bold / italic markers
		.replace(/\*\*/g, "")
		.replace(/[*_]/g, "")
		// newlines
		.replace(/\r?\n/g, " ")
		// collapse spaces
		.replace(/\s+/g, " ")
		.trim();
}

// Remove punctuation after links are gone
export function stripPunctuation(text: string): string {
	return text
		.replace(/[.,!?;:()\[\]{}'"«»…\-–—]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function firstWords(text: string, count: number): string {
	if (!text) return "";
	const words = text.split(/\s+/);
	return words.slice(0, count).join(" ");
}

export function makeSummary(text: string, n: number): string {
	let f = flatten(text);
	f = stripPunctuation(f);
	return firstWords(f, n);
}