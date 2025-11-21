// main.ts
import { Plugin, WorkspaceLeaf } from "obsidian";
import { EpochSettings, DEFAULT_SETTINGS, EpochSettingTab } from "./settings";
import { Indexer } from "./indexer/indexer";
import { EpochView } from "./ui/epoch-view";
import { VIEW_TYPE_EPOCH } from "./ui/epoch-view-mode";

export default class EpochPlugin extends Plugin {
	settings: EpochSettings;
	indexer: Indexer;
	noteLeaf: WorkspaceLeaf | null = null;

	async onload() {
		await this.loadSettings();
		this.indexer = new Indexer(this);

		this.addSettingTab(new EpochSettingTab(this.app, this));

		this.addCommand({
			id: "epoch-open-view",
			name: "Open epoch view",
			callback: () => this.openEpochView()
		});

		this.addCommand({
			id: "epoch-rebuild-index",
			name: "Rebuild epoch index",
			callback: () => this.rebuildIndex()
		});

		this.addRibbonIcon("hourglass", "Open epoch view", () => {
			this.openEpochView();
		});

		this.registerView(
			VIEW_TYPE_EPOCH,
			(leaf) => new EpochView(leaf, this)
		);

		const data = await this.loadData();
		this.indexer.index = data?.index || {};
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_EPOCH);
	}

	async openEpochView() {
		const current = this.app.workspace.getMostRecentLeaf();
		if (current && current.view.getViewType() === "markdown") {
			this.noteLeaf = current;
		}

		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_EPOCH);

		if (leaves.length > 0) {
			const leaf = leaves[0];
			this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as any;
			if (view?.focusToday) view.focusToday();
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);

		await leaf.setViewState({
			type: VIEW_TYPE_EPOCH,
			active: true
		});

		this.app.workspace.revealLeaf(leaf);
	}

	async rebuildIndex() {
		await this.indexer.rebuild();
		new Notice("Epoch index rebuilt");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		this.saveData(this.settings);
	}
}