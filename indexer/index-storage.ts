import { App, normalizePath } from "obsidian";
import type { EpochIndex } from "./types";

const INDEX_FILE_NAME = "epoch-index.json";

export class EpochIndexStore {
	private app: App;
	private pluginId: string;

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.pluginId = pluginId;
	}

	private getPath(): string {
		return normalizePath(`.obsidian/plugins/${this.pluginId}/${INDEX_FILE_NAME}`);
	}

	async load(): Promise<EpochIndex> {
		const path = this.getPath();
		const adapter = this.app.vault.adapter;

		if (!(await adapter.exists(path))) {
			return {};
		}

		try {
			const raw = await adapter.read(path);
			const data = JSON.parse(raw);
			if (data && typeof data === "object") {
				return data as EpochIndex;
			}
		} catch (e) {
			console.error("Epoch: failed to load index", e);
		}
		return {};
	}

	async save(index: EpochIndex): Promise<void> {
		const path = this.getPath();
		const adapter = this.app.vault.adapter;

		try {
			// @ts-ignore
			if (typeof adapter.mkdir === "function") {
				// @ts-ignore
				await adapter.mkdir(normalizePath(`.obsidian/plugins/${this.pluginId}`));
			}
		} catch (e) {
		}

		try {
			await adapter.write(path, JSON.stringify(index));
		} catch (e) {
			console.error("Epoch: failed to save index", e);
		}
	}
}
