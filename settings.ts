import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import EpochPlugin from "./main";

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
	newNotePath: ""
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
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.trackChanges)
					.onChange(async value => {
						this.plugin.settings.trackChanges = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Parse dates")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.parseContentDates)
					.onChange(async value => {
						this.plugin.settings.parseContentDates = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show attachments")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.showAttachments)
					.onChange(async value => {
						this.plugin.settings.showAttachments = value;
						await this.plugin.saveSettings();
					})
			);
        
        const summaryWordsCountCountSetting = new Setting(containerEl);

		summaryWordsCountCountSetting
            .setName(`Summary words (${this.plugin.settings.summaryWordsCount})`)
            .addSlider(slider => {
                slider
                    .setLimits(3, 10, 1)
                    .setValue(this.plugin.settings.summaryWordsCount)
                    .setDynamicTooltip()
                    .onChange(async value => {
                        this.plugin.settings.summaryWordsCount = value;
                        summaryWordsCountCountSetting.setName(`Summary words count (${value})`);
                        await this.plugin.saveSettings();
                    });
            });

		new Setting(containerEl)
			.setName("New note location")
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
			.addButton(btn => {
				btn.setButtonText("Rebuild index")
					.setCta()
					.onClick(() => {
						this.plugin.rebuildIndex();
					});
			});
	}
}