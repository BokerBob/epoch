import {
	Plugin,
	WorkspaceLeaf,
	Notice,
	TFile,
	TAbstractFile,
	TFolder
} from "obsidian";

import { EpochSettings, DEFAULT_SETTINGS, EpochSettingTab } from "./settings";
import { Indexer } from "./indexer/indexer";
import { EpochView } from "./ui/epoch-view";
import { VIEW_TYPE_EPOCH } from "./ui/epoch-view-mode";
import type { EpochIndex } from "./indexer/types";
import {
	removeFileFromIndex,
	renameFileInIndex,
	sortIndex
} from "./indexer/indexer-utils";

export default class EpochPlugin extends Plugin {
	settings: EpochSettings;
	indexer: Indexer;
	noteLeaf: WorkspaceLeaf | null = null;

	private lastRebuildNoticeAt = 0;

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
			callback: () => this.rebuildIndexWithProgress()
		});

		this.addRibbonIcon("hourglass", "Open epoch view", () => {
			this.openEpochView();
		});

		this.registerView(
			VIEW_TYPE_EPOCH,
			(leaf: WorkspaceLeaf) => new EpochView(leaf, this)
		);

		const data = await this.loadData();
		this.indexer.index = (data?.index as EpochIndex) || {};

		if (!data?.index) {
			await this.rebuildIndexWithProgress();
		}

		this.registerFileEvents();
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
			const view = leaf.view as EpochView;
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

	private registerFileEvents() {
		this.app.vault.offref && this.app.vault.offref(this);

		this.registerEvent(
			this.app.vault.on("create", async (file: TAbstractFile) => {
				if (!(file instanceof TFile)) return;
				await this.indexer.processFile(file);
				await this.saveData({ index: this.indexer.index });
				this.refreshEpochViews();
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", async (file: TAbstractFile) => {
				if (!(file instanceof TFile)) return;
				removeFileFromIndex(this.indexer.index, file.path);
				await this.saveData({ index: this.indexer.index });
				this.refreshEpochViews();
			})
		);

		this.registerEvent(
			this.app.vault.on(
				"rename",
				async (file: TAbstractFile, oldPath: string) => {
					if (!(file instanceof TFile)) return;
					renameFileInIndex(this.indexer.index, oldPath, file.path);
					await this.saveData({ index: this.indexer.index });
					this.refreshEpochViews();
				}
			)
		);

		if (this.settings.trackChanges) {
			this.registerEvent(
				// @ts-ignore
				this.app.workspace.on("editor-change", async (editor, info) => {
					const file = this.app.workspace.getActiveFile();
					if (!file) return;
					await this.indexer.processFile(file);
					await this.saveData({ index: this.indexer.index });
					this.refreshEpochViews();
				})
			);
		} else {
			this.registerEvent(
				this.app.vault.on("modify", async (file: TAbstractFile) => {
					if (!(file instanceof TFile)) return;
					await this.indexer.processFile(file);
					await this.saveData({ index: this.indexer.index });
					this.refreshEpochViews();
				})
			);
		}
	}

	async rebuildIndexWithProgress() {
		const files = this.app.vault.getFiles();
		const total = files.length;
		let processed = 0;

		this.indexer.index = {};
		this.lastRebuildNoticeAt = 0;

		const start = Date.now();

		for (const file of files) {
			await this.indexer.processFile(file);
			processed++;

			const now = Date.now();
			if (now - this.lastRebuildNoticeAt > 1000) {
				this.lastRebuildNoticeAt = now;
				new Notice(`Epoch indexing… ${processed}/${total}`);
			}
		}

		this.indexer.index = sortIndex(this.indexer.index);
		await this.saveData({ index: this.indexer.index });
		new Notice("Epoch index rebuilt");

		this.refreshEpochViews();
	}

	private refreshEpochViews() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_EPOCH);
		for (const leaf of leaves) {
			const view = leaf.view as EpochView;
			view.canvas?.refreshIndex();
		}
	}

	async onSettingsChanged(key: keyof EpochSettings) {
		await this.saveSettings();

		if (
			key === "parseContentDates" ||
			key === "showAttachments" ||
			key === "generateSummaries" ||
			key === "summaryWordsCount"
		) {
			await this.rebuildIndexWithProgress();
		}

		if (key === "trackChanges") {
			this.registerFileEvents();
		}
	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}