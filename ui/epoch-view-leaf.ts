import { WorkspaceLeaf } from "obsidian";
import { EpochPlugin } from "../main";
import { VIEW_TYPE_EPOCH } from "./epoch-view-mode";
import { EpochView } from "./epoch-view";

export function createEpochLeaf(plugin: EpochPlugin): WorkspaceLeaf {
	const leaf =
		plugin.app.workspace.getLeavesOfType(VIEW_TYPE_EPOCH)[0] ??
		plugin.app.workspace.getRightLeaf(false);

	leaf.setViewState({ type: VIEW_TYPE_EPOCH, active: true });
	return leaf;
}