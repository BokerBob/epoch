import { Plugin } from "obsidian";
import { EpochSettings, DEFAULT_SETTINGS, EpochSettingTab } from "./settings";
import { Indexer } from "./indexer/indexer";

export default class EpochPlugin extends Plugin {
	settings: EpochSettings;
	indexer: Indexer;

	async onload() {
		await this.loadSettings();
		this.indexer = new Indexer(this);

		this.addSettingTab(new EpochSettingTab(this.app, this));

		this.addCommand({
			id: "epoch-rebuild-index",
			name: "Rebuild Epoch index",
			callback: () => this.rebuildIndex()
		});

		const data = await this.loadData();
		this.indexer.index = data?.index || {};
	}

	async rebuildIndex() {
		await this.indexer.rebuild();
		new Notice("Epoch index rebuilt");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}