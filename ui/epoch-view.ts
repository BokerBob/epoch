// ui/epoch-view.ts
import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_EPOCH } from "./epoch-view-mode";
import { EpochCanvas } from "./epoch-canvas";
import "../styles.css";

export class EpochView extends ItemView {
	plugin: any;
	container: HTMLElement;
	canvas: EpochCanvas;

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_EPOCH;
	}

	getDisplayText() {
		return "Epoch view";
	}

	getIcon(): string {
		return "hourglass";
	}

	async onOpen() {
		this.container = this.contentEl.createDiv("epoch-container");
		const root = this.container.createDiv("epoch-root");
		this.canvas = new EpochCanvas(root, this.plugin);

		requestAnimationFrame(() => {
			this.canvas.initSize();
			this.canvas.focusToday();
		});
	}

	focusToday() {
		if (!this.canvas) return;
		this.canvas.focusToday();
	}

	async onClose() {
		this.container?.empty();
		this.canvas?.destroy();
	}
}
