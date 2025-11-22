import {
	Plugin,
	WorkspaceLeaf,
	Notice,
	TFile,
	TAbstractFile,
	TFolder,
	EventRef
} from "obsidian";

import { EpochSettings, DEFAULT_SETTINGS, EpochSettingTab } from "./settings";
import { Indexer } from "./indexer/indexer";
import { EpochView } from "./ui/epoch-view";
import { VIEW_TYPE_EPOCH } from "./ui/epoch-view-mode";
import type { SerializedEpochIndex } from "./indexer/types";

export default class EpochPlugin extends Plugin {
	settings: EpochSettings;
	indexer: Indexer;
	noteLeaf: WorkspaceLeaf | null = null;
	private vaultEventRefs: EventRef[] = [];
	private workspaceEventRefs: EventRef[] = [];

	private lastRebuildNoticeAt = 0;

	async onload() {
		const saved = (await this.loadData()) as
			| { settings?: Partial<EpochSettings>; index?: SerializedEpochIndex }
			| null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved?.settings ?? {});
		this.indexer = new Indexer(this);
		await this.indexer.load(saved?.index);

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

		const hasIndex = Boolean(
			saved?.index && (saved.index as SerializedEpochIndex).dates
		);
		if (!hasIndex) {
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
		if (!leaf) return;

		await leaf.setViewState({
			type: VIEW_TYPE_EPOCH,
			active: true
		});

		this.app.workspace.revealLeaf(leaf);
	}

	private registerFileEvents() {
		for (const ref of this.vaultEventRefs) {
			this.app.vault.offref(ref);
		}
		for (const ref of this.workspaceEventRefs) {
			this.app.workspace.offref(ref);
		}
		this.vaultEventRefs = [];
		this.workspaceEventRefs = [];

		const createRef = this.app.vault.on("create", async (file: TAbstractFile) => {
			if (!(file instanceof TFile)) return;
			await this.indexer.processFile(file, { reason: "create" });
			await this.persist();
			this.refreshEpochViews();
		});
		this.registerEvent(createRef);
		this.vaultEventRefs.push(createRef);

		const deleteRef = this.app.vault.on("delete", async (file: TAbstractFile) => {
			if (!(file instanceof TFile)) return;
			this.indexer.removeFile(file.path);
			await this.persist();
			this.refreshEpochViews();
		});
		this.registerEvent(deleteRef);
		this.vaultEventRefs.push(deleteRef);

		const renameRef = this.app.vault.on(
			"rename",
			async (file: TAbstractFile, oldPath: string) => {
				if (!(file instanceof TFile)) return;
				await this.indexer.renameFile(oldPath, file.path);
				await this.persist();
				this.refreshEpochViews();
			}
		);
		this.registerEvent(renameRef);
		this.vaultEventRefs.push(renameRef);

		if (this.settings.trackChanges) {
			const trackRef = this.app.workspace.on(
				"editor-change",
				async (_editor, _info) => {
					const file = this.app.workspace.getActiveFile();
					if (!file) return;
					await this.indexer.processFile(file, { reason: "track" });
					await this.persist();
					this.refreshEpochViews();
				}
			);
			this.registerEvent(trackRef);
			this.workspaceEventRefs.push(trackRef);
		} else {
			const modifyRef = this.app.vault.on("modify", async (file: TAbstractFile) => {
				if (!(file instanceof TFile)) return;
				await this.indexer.processFile(file, { reason: "modify" });
				await this.persist();
				this.refreshEpochViews();
			});
			this.registerEvent(modifyRef);
			this.vaultEventRefs.push(modifyRef);
		}
	}

	async rebuildIndexWithProgress() {
		const files = this.app.vault.getFiles();
		this.lastRebuildNoticeAt = 0;

		await this.indexer.rebuildAll(files, (processed, total) => {
			const now = Date.now();
			if (now - this.lastRebuildNoticeAt > 1000) {
				this.lastRebuildNoticeAt = now;
				new Notice(`Epoch indexing… ${processed}/${total}`);
			}
		});

		await this.persist();
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
			key === "summaryWordsCount" ||
			key === "trackChanges"
		) {
			await this.rebuildIndexWithProgress();
		}

		if (key === "trackChanges") {
			this.registerFileEvents();
		}
	}

	private async persist() {
		await this.saveData({
			settings: this.settings,
			index: this.indexer.toJSON()
		});
	}

	async saveSettings() {
		await this.persist();
	}
}