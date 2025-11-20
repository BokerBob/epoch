export function flattenForDates(raw: string): string {
	if (!raw) return "";

	let text = raw;

	return text
		// frontmatter
		.replace(/^---[\s\S]*?---/gm, " ")

		// Obsidian comments
		.replace(/%%[\s\S]*?%%/g, " ")

		// HTML comments
		.replace(/<!--[\s\S]*?-->/g, " ")

		// <style>...</style>
		.replace(/<style[\s\S]*?<\/style>/gi, " ")

		// ``` fenced code ```
		.replace(/```[\s\S]*?```/g, " ")

		// inline code
		.replace(/`[^`]*`/g, " ")

		// images ![[...]]
		.replace(/!\[\[.*?]]/g, " ")

		// wiki links [[...]]
		.replace(/\[\[[^\]]+]]/g, " ")

		// markdown links [text](url)
		.replace(/\[[^\]]*]\([^)]*\)/g, " ")

		// raw URLs
		.replace(/https?:\/\/\S+/g, " ")

		// images ![](url)
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")

		// tags #tag
		.replace(/(^|\s)#[\w\-\/]+/g, " ")

		// headings
		.replace(/#+\s+/g, " ")

		// blockquotes >
		.replace(/^\s*>+\s?/gm, " ")

		// lists
		.replace(/^\s*[-*+]\s+/gm, " ")

		// formatting
		.replace(/\*\*/g, " ")
		.replace(/[*_]/g, " ")

		// entities
		.replace(/&[a-z]+;/gi, " ")

		// newlines
		.replace(/\r?\n/g, " ")

		// collapse
		.replace(/\s+/g, " ")
		.trim();
}

export function flattenForSummary(raw: string): string {
	if (!raw) return "";

	const LINK_MAX = 20;

	const cleanUrl = (url: string): string => {
		let u = url.trim()
			.replace(/^(https?:\/\/)/i, "")
			.replace(/^www\./i, "");

		let hadQuery = false;
		if (u.includes("?")) {
			hadQuery = true;
			u = u.replace(/\?.*$/, "");
		}

		u = u.replace(/\/$/, "");
		if (hadQuery) return u + "...";
		return u.length > LINK_MAX ? u.slice(0, LINK_MAX) + "..." : u;
	};

	let text = raw;
	const urls: string[] = [];
	const files: string[] = [];

	// YAML frontmatter
	text = text.replace(/^---[\s\S]*?---\s*/m, " ");

	// quotes but keep content
	text = text.replace(/"([^"]+)"|'([^']+)'/g, (_, a, b) => a || b);

	// Obsidian embeds: keep non-image filenames
	text = text.replace(/!\[\[([^\]]+?)]]/g, (_, fname) => {
		if (/\.(png|jpg|jpeg|gif|svg|webp|bmp|tiff|avif)$/i.test(fname)) return " ";
		return fname;
	});

	// Wiki links
	text = text.replace(/\[\[([^\]]+?)]]/g, "$1");

	// Markdown links
	text = text.replace(/\[([^\]]*)]\(([^)]*)\)/g, (_, label, url) => {
		const cleaned = cleanUrl(url);
		const ph = `URLPH${urls.length}TOKEN`;
		urls.push(cleaned);
		return `${label} (${ph})`;
	});

	// Raw URLs
	text = text.replace(/https?:\/\/\S+|www\.\S+/gi, match => {
		const cleaned = cleanUrl(match);
		const ph = `URLPH${urls.length}TOKEN`;
		urls.push(cleaned);
		return ph;
	});

	// // Remove image filenames everywhere
	// text = text.replace(/\b[\w.-]+\.(png|jpg|jpeg|gif|svg|webp|bmp|tiff|avif)\b/gi, " ");

	// Protect remaining filenames (any ext)
	text = text.replace(/\b[\w-]+\.\w{2,5}\b/g, m => {
		const id = files.length;
		files.push(m);
		return `FILETOKEN${id}`;
	});

	// Structural markdown / junk
	text = text
		.replace(/%%[\s\S]*?%%/g, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/(^|\s)#[\w\-\/]+/g, " ")
		.replace(/#+\s+/g, " ")
		.replace(/^\s*>+\s?/gm, " ")
		.replace(/^\s*[-*+]\s+/gm, " ")
		.replace(/\*\*/g, " ")
		.replace(/[*_]/g, " ")
		.replace(/[=]+/g, " ")
		.replace(/\r?\n/g, " ");

	// Remove | / ( )
	text = text.replace(/[|/()]/g, " ");

	// Remove standalone dashes / en/em dashes, keep in dates/words
	text = text.replace(/[-–—-](?![\dA-Za-z])/g, " ");

	// Protect decimals
	text = text.replace(/(\d)\.(\d)/g, "$1DECIM_$2");

	// Remove brackets
	text = text.replace(/[{}\[\]«»„”“]/g, " ");

	// Generic punctuation
	text = text.replace(/(\d):(\d{2})/g, "$1TIMEP_$2");
	text = text.replace(/[.,!?;]+/g, " "); // remove everything except :
	text = text.replace(/:/g, " ");        // remove : everywhere
	text = text.replace(/TIMEP_/g, ":");

	// Restore decimals
	text = text.replace(/DECIM_/g, ".");

	// Restore filenames
	for (let i = 0; i < files.length; i++) {
		const ph = new RegExp(`FILETOKEN${i}`, "g");
		text = text.replace(ph, files[i]);
	}

	// Restore URLs
	for (let i = 0; i < urls.length; i++) {
		const ph = new RegExp(`URLPH${i}TOKEN`, "g");
		text = text.replace(ph, urls[i]);
	}

	return text.replace(/\s+/g, " ").trim();
}
