import { App, PluginSettingTab, Setting } from "obsidian";
import EpochPlugin from "./main";

export interface EpochSettings {
	trackChanges: boolean;
	parseDates: boolean;
	dateFormat: string;
	summaryWordsCount: number;
}

export const DEFAULT_SETTINGS: EpochSettings = {
	trackChanges: true,
	parseDates: true,
	dateFormat: "dd-MM-yyyy",
	summaryWordsCount: 7
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
			.setName("Rebuild index")
			.addButton(btn => {
				btn.setButtonText("Rebuild")
					.setCta()
					.onClick(() => {
						this.plugin.rebuildIndex();
					});
			});

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
			.setName("Parse dates in content")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.parseDates)
					.onChange(async value => {
						this.plugin.settings.parseDates = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Date format")
			.setDesc("Example: dd-MM-yyyy")
			.addText(text =>
				text
					.setPlaceholder("dd-MM-yyyy")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async value => {
						this.plugin.settings.dateFormat = value.trim();
						await this.plugin.saveSettings();
					})
			);
        
        const summaryWordsCountCountSetting = new Setting(containerEl);

		summaryWordsCountCountSetting
            .setName(`Summary words count (${this.plugin.settings.summaryWordsCount})`)
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
	}
}