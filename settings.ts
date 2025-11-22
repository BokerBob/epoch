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
	summaryWordsCount: number;
	newNotePath: string;
}

export const DEFAULT_SETTINGS: EpochSettings = {
	trackChanges: true,
	parseContentDates: true,
	showAttachments: false,
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

		new Setting(containerEl)
			.setName("Track changes")
			.setDesc("Enable tracking of changes within individual blocks.")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.trackChanges)
					.onChange(async (value) => {
						this.plugin.settings.trackChanges = value;
						await this.plugin.onSettingsChanged("trackChanges");
					})
			);

		new Setting(containerEl)
			.setName("Parse dates")
			.setDesc("Try to extract dates from the content of notes.")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.parseContentDates)
					.onChange(async (value) => {
						this.plugin.settings.parseContentDates = value;
						await this.plugin.onSettingsChanged("parseContentDates");
					})
			);

		new Setting(containerEl)
			.setName("Show attachments")
			.setDesc("Show images and other attachments in the timeline.")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.showAttachments)
					.onChange(async (value) => {
						this.plugin.settings.showAttachments = value;
						await this.plugin.onSettingsChanged("showAttachments");
					})
			);

		const summarySetting = new Setting(containerEl);
		const setSummaryLabel = (val: number) => {
			if (val <= 0) {
				summarySetting.setName("Summary length (disabled)");
			} else {
				summarySetting.setName(`Summary length (${val} words)`);
			}
		};
		const currentSummaryWords = this.plugin.settings.summaryWordsCount;
		setSummaryLabel(currentSummaryWords);
		summarySetting.setDesc("Number of words to include in generated summaries. Set to 0 to disable.");
		summarySetting
			.addSlider(slider => {
				slider
					.setLimits(0, 12, 1)
					.setValue(currentSummaryWords)
					.setDynamicTooltip()
					.onChange(async (value) => {
						const rounded = Math.round(value);
						if (rounded !== value) slider.setValue(rounded);
						this.plugin.settings.summaryWordsCount = rounded;
						setSummaryLabel(rounded);
						await this.plugin.onSettingsChanged("summaryWordsCount");
				});
			});

		new Setting(containerEl)
			.setName("New note location")
			.setDesc("Default folder for new notes created via Epoch.")
			.addDropdown(drop => {
				const folders: TFolder[] = [];
				for (const f of this.app.vault.getAllLoadedFiles()) {
					if (f instanceof TFolder) folders.push(f);
				}
				folders.sort((a, b) => a.path.localeCompare(b.path));

				drop.addOption("", "(vault root)");
				for (const f of folders) {
					drop.addOption(f.path, f.path);
				}

				drop.setValue(this.plugin.settings.newNotePath || "");

				drop.onChange(async value => {
					this.plugin.settings.newNotePath = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Rebuild index")
			.setDesc("Full rescan of the vault and Epoch index.")
			.addButton(btn =>
				btn
					.setButtonText("Rebuild")
					.setClass("mod-cta")
					.onClick(async () => {
						new Notice("Epoch: rebuilding index…");
						await this.plugin.rebuildIndexWithProgress();
					})
			);
	}
}
