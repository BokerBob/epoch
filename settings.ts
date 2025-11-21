import { App, PluginSettingTab, Setting } from "obsidian";
import EpochPlugin from "./main";

export interface EpochSettings {
	trackChanges: boolean;
	parseContentDates: boolean;
	summaryWordsCount: number;
}

export const DEFAULT_SETTINGS: EpochSettings = {
	trackChanges: true,
	parseContentDates: true,
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
			.addButton(btn => {
				btn.setButtonText("Rebuild index")
					.setCta()
					.onClick(() => {
						this.plugin.rebuildIndex();
					});
			});
	}
}