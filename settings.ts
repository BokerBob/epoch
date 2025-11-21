// settings.ts
import {
	App,
	PluginSettingTab,
	Setting,
	TFolder,
	Notice
} from "obsidian";
import type EpochPlugin from "./main";

export interface EpochSettings {
	trackChanges: boolean;
	parseContentDates: boolean;
	showAttachments: boolean;
	generateSummaries: boolean;
	summaryWordsCount: number;
	newNotePath: string;
}

export const DEFAULT_SETTINGS: EpochSettings = {
	trackChanges: true,
	parseContentDates: true,
	showAttachments: false,
	generateSummaries: true,
	summaryWordsCount: 7,
	newNotePath: "/"
};

export class EpochSettingTab extends PluginSettingTab {
	plugin: EpochPlugin;

	constructor(app: App, plugin: EpochPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// trackChanges
		new Setting(containerEl)
			.setName("Track changes in blocks")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.trackChanges)
					.onChange(async (value) => {
						this.plugin.settings.trackChanges = value;
						await this.plugin.onSettingsChanged("trackChanges");
					})
			);

		// parseContentDates
		new Setting(containerEl)
			.setName("Parse dates from content and file names")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.parseContentDates)
					.onChange(async (value) => {
						this.plugin.settings.parseContentDates = value;
						await this.plugin.onSettingsChanged("parseContentDates");
					})
			);

		// showAttachments
		new Setting(containerEl)
			.setName("Show attachments")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.showAttachments)
					.onChange(async (value) => {
						this.plugin.settings.showAttachments = value;
						await this.plugin.onSettingsChanged("showAttachments");
					})
			);

		// generateSummaries
		new Setting(containerEl)
			.setName("Generate summaries")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.generateSummaries)
					.onChange(async (value) => {
						this.plugin.settings.generateSummaries = value;
						await this.plugin.onSettingsChanged("generateSummaries");
					})
			);

		// summaryWordsCount
		new Setting(containerEl)
			.setName("Summary length (words)")
			.addText(text =>
				text
					.setPlaceholder("12")
					.setValue(String(this.plugin.settings.summaryWordsCount))
					.onChange(async (value) => {
						const n = Number(value);
						if (!Number.isFinite(n) || n <= 0) return;
						this.plugin.settings.summaryWordsCount = n;
						await this.plugin.onSettingsChanged("summaryWordsCount");
					})
			);

		// ----- Rebuild index button -----
			new Setting(containerEl)
				.setName("Rebuild index")
				.setDesc("Full rescan of the vault and Epoch index.")
				.addButton(btn =>
					btn
						.setButtonText("Rebuild")
						.onClick(async () => {
							new Notice("Epoch: rebuilding index…");
							await this.plugin.rebuildIndexWithProgress();
						})
				);
	}
}
