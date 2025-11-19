import { DDMap, DateEntry } from "./types";

export class Merger {
	merge(dd: DDMap): DateEntry[] {
		const out: DateEntry[] = [];

		for (const date in dd) {
			const blocks = dd[date];
			const uniq: string[] = [];
			let prev: string | null = null;

			for (const id of blocks) {
				if (id === prev) continue;
				uniq.push(id);
				prev = id;
			}

			out.push({
				date,
				blocks: uniq,
				summary: "",
				notePath: ""
			});
		}

		return out;
	}
}