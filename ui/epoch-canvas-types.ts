import type { DateEntry } from "../indexer/types";

export type DateKind = "day" | "month" | "year";

export interface SummaryRect {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	itemIndex: number;
	entry: DateEntry;
}

export interface DayLayout {
	index: number;
	y: number;
	kind: DateKind;
	dateRect: { x1: number; y1: number; x2: number; y2: number };
	summaryRects: SummaryRect[];
	hasVisibleDate: boolean;
}

export interface HoverOverlay {
	x: number;
	yTop: number;
	yBottom: number;
	yCenter: number;
	width: number;
	text: string;
	font: string;
}
