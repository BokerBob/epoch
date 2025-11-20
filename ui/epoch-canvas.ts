// ui/epoch-canvas.ts
import { MarkdownView, TFile } from "obsidian";
import type { EpochIndex, DateEntry } from "../indexer/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE_SPACING = 40;

const DAY_LABEL_MIN_SCALE = 0.35;
const DAY_DOT_MIN_SCALE = 0.2;
const MONTH_LABEL_MIN_SCALE = 0.03;
const MONTH_DOT_MIN_SCALE = 0.02;
const YEAR_LABEL_MIN_SCALE = 0.001;
const SUMMARY_MIN_SCALE = 0.6;

const MIN_SCALE = 0.01;
const MAX_SCALE = 5;
const ZOOM_INTENSITY = 0.003;

const VERTICAL_PADDING = 200;
const TIMELINE_X = 60;
const LINE_EXTRA = 2000;

const DOT_RADIUS_DAY = 2;
const DOT_RADIUS_MONTH = 4;
const DOT_RADIUS_YEAR = 7;
const TODAY_RADIUS = 6;

const DATE_RECT_HALF_HEIGHT = 12;
const DATE_RECT_RIGHT_EXTRA = 40;
const LABEL_OFFSET_X = 10;

const SUMMARY_MARGIN = 6;
const SUMMARY_ROW_HEIGHT = 12;
const SUMMARY_RIGHT_MARGIN = 16;
const SUMMARY_OFFSET_X = 16;
const SUMMARY_MIN_WIDTH = 40;
const SUMMARY_MAX_COL_WIDTH = 260;
const SUMMARY_MIN_TEXT_WIDTH = 40;

const TODAY_OFFSET_Y_INITIAL = 80;

type DateKind = "day" | "month" | "year";

interface SummaryRect {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	itemIndex: number;
	entry: DateEntry;
}

interface DayLayout {
	index: number;
	y: number;
	kind: DateKind;
	dateRect: { x1: number; y1: number; x2: number; y2: number };
	summaryRects: SummaryRect[];
}

export class EpochCanvas {
	private root: HTMLElement;
	private plugin: any;

	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;

	private scale = 1;
	private offsetY = TODAY_OFFSET_Y_INITIAL;

	private isDragging = false;
	private dragStartY = 0;
	private dragStartOffsetY = 0;

	private index: EpochIndex = {};

	private layouts: DayLayout[] = [];
	private hoverDateIndex: number | null = null;
	private hoverSummary: { dayIndex: number; itemIndex: number } | null = null;

	constructor(root: HTMLElement, plugin: any) {
		this.root = root;
		this.plugin = plugin;

		this.canvas = root.createEl("canvas");
		this.ctx = this.canvas.getContext("2d")!;

		this.loadIndex();
		this.bind();
	}

	public initSize() {
		this.resize();
	}

	focusToday() {
		this.scale = 1;
		this.offsetY = TODAY_OFFSET_Y_INITIAL;
		this.hoverDateIndex = null;
		this.hoverSummary = null;
		this.draw();
	}

	private loadIndex() {
		this.index = this.plugin.indexer.index as EpochIndex;
	}

	private bind() {
		window.addEventListener("resize", () => this.resize());
		this.canvas.addEventListener("wheel", e => this.onWheel(e), { passive: false });
		this.canvas.addEventListener("mousedown", e => this.onDown(e));
		window.addEventListener("mousemove", e => this.onMove(e));
		window.addEventListener("mouseup", () => this.onUp());

		this.canvas.addEventListener("mousemove", e => this.onHoverMouse(e));
		this.canvas.addEventListener("mouseleave", () => this.clearHover());
		this.canvas.addEventListener("touchstart", e => this.onTouchStart(e), { passive: true });
		this.canvas.addEventListener("click", e => this.onClick(e));
	}

	private resize() {
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = this.root.clientWidth * dpr;
		this.canvas.height = this.root.clientHeight * dpr;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.draw();
	}

	private onWheel(e: WheelEvent) {
		e.preventDefault();
		if (e.ctrlKey) {
			const rect = this.canvas.getBoundingClientRect();
			const mouseY = e.clientY - rect.top;

			const prevScale = this.scale;
			const zoomFactor = Math.exp(-e.deltaY * ZOOM_INTENSITY);

			let newScale = this.scale * zoomFactor;
			newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

			const worldY = (mouseY - this.offsetY) / prevScale;
			this.scale = newScale;
			this.offsetY = mouseY - worldY * this.scale;
		} else {
			this.offsetY -= e.deltaY;
		}
		this.draw();
	}

	private onDown(e: MouseEvent) {
		this.isDragging = true;
		this.dragStartY = e.clientY;
		this.dragStartOffsetY = this.offsetY;
	}

	private onMove(e: MouseEvent) {
		if (!this.isDragging) return;
		const dy = e.clientY - this.dragStartY;
		this.offsetY = this.dragStartOffsetY + dy;
		this.draw();
	}

	private onUp() {
		this.isDragging = false;
	}

	private onHoverMouse(e: MouseEvent) {
		const rect = this.canvas.getBoundingClientRect();
		this.updateHover(e.clientX - rect.left, e.clientY - rect.top);
	}

	private onTouchStart(e: TouchEvent) {
		const t = e.touches[0];
		if (!t) return;
		const rect = this.canvas.getBoundingClientRect();
		this.updateHover(t.clientX - rect.left, t.clientY - rect.top);
	}

    private async onClick(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        for (const d of this.layouts) {
            for (const s of d.summaryRects) {
                if (x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2) {
                    const entry = s.entry;
                    console.log("summary", entry.date, entry.file, entry.blockStart);
                    await this.openEntry(entry, e);
                    return;
                }
            }
        }

        for (const d of this.layouts) {
            const r = d.dateRect;
            if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
                const today = this.getToday();
                const date = this.getDateForIndex(d.index, today);
                console.log(d.kind, date);
                return;
            }
        }
    }

	private async openEntry(entry: DateEntry, ev?: MouseEvent) {
		const app = this.plugin.app;
		const file = app.vault.getAbstractFileByPath(entry.file);
		if (!(file instanceof TFile)) return;

		let leaf: WorkspaceLeaf;

		if (ev?.ctrlKey || ev?.metaKey) {
			leaf = app.workspace.getLeaf(true);
		} else {
			const active = app.workspace.getMostRecentLeaf();
			const mdLeaves = app.workspace.getLeavesOfType("markdown");

			if (active && active.view.getViewType() === "markdown") {
				leaf = active;
			} else if (mdLeaves.length > 0) {
				leaf = mdLeaves[0];
			} else {
				leaf = app.workspace.getLeaf(true);
			}
		}

		app.workspace.revealLeaf(leaf);

		await leaf.openFile(file);

		const view = leaf.view as MarkdownView | null;
		if (!view) return;

		const line = Math.max(0, entry.blockStart ?? 0);
		view.editor.setCursor({ line, ch: 0 });

		view.editor.scrollIntoView(
			{ from: { line, ch: 0 }, to: { line, ch: 0 } },
			true
		);
	}


	private clearHover() {
		if (this.hoverDateIndex == null && this.hoverSummary == null) return;
		this.hoverDateIndex = null;
		this.hoverSummary = null;
		this.canvas.style.cursor = "default";
		this.draw();
	}

	private updateHover(x: number, y: number) {
		for (const d of this.layouts) {
			for (const s of d.summaryRects) {
				if (x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2) {
					this.hoverSummary = { dayIndex: d.index, itemIndex: s.itemIndex };
					this.hoverDateIndex = null;
					this.canvas.style.cursor = "pointer";
					this.draw();
					return;
				}
			}
		}

		let newDateIndex: number | null = null;
		for (const d of this.layouts) {
			const r = d.dateRect;
			if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
				newDateIndex = d.index;
				break;
			}
		}

		this.hoverSummary = null;
		this.hoverDateIndex = newDateIndex;
		this.canvas.style.cursor = newDateIndex != null ? "pointer" : "default";
		this.draw();
	}

	private getToday(): Date {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}

	private getDateForIndex(i: number, today: Date): Date {
		return new Date(today.getTime() - i * MS_PER_DAY);
	}

    private formatKey(date: Date): string {
        const dd = String(date.getDate()).padStart(2, "0");
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const yyyy = date.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

	private truncate(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string {
		if (!text) return "";
		if (ctx.measureText(text).width <= maxWidth) return text;
		const ell = "...";
		let low = 0;
		let high = text.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			const candidate = text.slice(0, mid) + ell;
			if (ctx.measureText(candidate).width <= maxWidth) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		const len = Math.max(0, low - 1);
		return text.slice(0, len) + ell;
	}

	private draw() {
		const ctx = this.ctx;
		if (!this.canvas) return;

		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;

		ctx.clearRect(0, 0, w, h);

		const css = getComputedStyle(this.root);
		const colLine = css.getPropertyValue("--epoch-line-color").trim();
		const colTextBase = css.getPropertyValue("--epoch-text-color").trim();
		const colTextHover = css.getPropertyValue("--epoch-text-color-hover").trim();
		const colToday = css.getPropertyValue("--epoch-today-color").trim();
		const fontMain = css.getPropertyValue("--epoch-font-main");
		const fontSmall = css.getPropertyValue("--epoch-font-small");

		ctx.strokeStyle = colLine;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(TIMELINE_X, -LINE_EXTRA);
		ctx.lineTo(TIMELINE_X, h + LINE_EXTRA);
		ctx.stroke();

		const today = this.getToday();

		const minScreenY = -VERTICAL_PADDING;
		const maxScreenY = h + VERTICAL_PADDING;

		const minIndex = Math.floor((minScreenY - this.offsetY) / (BASE_SPACING * this.scale));
		const maxIndex = Math.ceil((maxScreenY - this.offsetY) / (BASE_SPACING * this.scale));

		ctx.textBaseline = "middle";

		const layouts: DayLayout[] = [];

		for (let i = minIndex; i <= maxIndex; i++) {
			const isToday = i === 0;

			const date = this.getDateForIndex(i, today);
			const d = date.getDate();
			const m = date.getMonth();
			const y = date.getFullYear();

			const worldY = i * BASE_SPACING;
			const yScreen = worldY * this.scale + this.offsetY;

			const isYearStart = d === 1 && m === 0;
			const isMonthStart = d === 1 && m !== 0;

			let label: string | null = null;
			let kind: DateKind = "day";

			if (isYearStart) {
				if (this.scale >= YEAR_LABEL_MIN_SCALE) {
					label = String(y);
				}
				kind = "year";
			} else if (isMonthStart) {
				if (this.scale >= MONTH_LABEL_MIN_SCALE) {
					label = date.toLocaleString("default", { month: "short" });
				}
				kind = "month";
			} else {
				if (this.scale >= DAY_LABEL_MIN_SCALE) {
					label = String(d);
				}
				kind = "day";
			}

			let showDot = true;
			let dotRadius = DOT_RADIUS_DAY;

			if (isToday) {
				showDot = false;
			} else if (isYearStart) {
				dotRadius = DOT_RADIUS_YEAR;
			} else if (isMonthStart) {
				dotRadius = DOT_RADIUS_MONTH;
				if (this.scale < MONTH_DOT_MIN_SCALE) showDot = false;
			} else {
				dotRadius = DOT_RADIUS_DAY;
				if (this.scale < DAY_DOT_MIN_SCALE) showDot = false;
			}

			const isDateHover = this.hoverDateIndex === i;
			const dateColor = isDateHover ? colTextHover : colTextBase;

			const hasVisibleDate = showDot || !!label || isToday;

			if (!hasVisibleDate && this.scale < DAY_LABEL_MIN_SCALE) {
				continue;
			}

			const dateRect = {
				x1: TIMELINE_X - (LABEL_OFFSET_X + 40),
				y1: yScreen - DATE_RECT_HALF_HEIGHT,
				x2: TIMELINE_X + 10,
				y2: yScreen + DATE_RECT_HALF_HEIGHT
			};

			const dayLayout: DayLayout = {
				index: i,
				y: yScreen,
				kind,
				dateRect,
				summaryRects: []
			};

			if (showDot) {
				ctx.fillStyle = dateColor;
				ctx.beginPath();
				ctx.arc(TIMELINE_X, yScreen, dotRadius, 0, Math.PI * 2);
				ctx.fill();
			}

			if (label) {
				ctx.fillStyle = dateColor;
				ctx.font = fontMain;
				ctx.textAlign = "right";
				ctx.fillText(label, TIMELINE_X - LABEL_OFFSET_X, yScreen);
			}

			if (isToday) {
				ctx.beginPath();
				ctx.arc(TIMELINE_X, yScreen, TODAY_RADIUS, 0, Math.PI * 2);
				if (isDateHover) {
					ctx.fillStyle = colToday;
					ctx.fill();
				}
                ctx.strokeStyle = colToday;
                ctx.lineWidth = 2;
                ctx.stroke();
			}

			const key = this.formatKey(date);
			const allEntries = this.index[key] || [];
			const entries = allEntries.filter(e => e.summary && e.summary.trim().length > 0);

			if (entries.length > 0) {
				const nextIndex = i + 1;
				const nextWorldY = nextIndex * BASE_SPACING;
				const yNext = nextWorldY * this.scale + this.offsetY;

				if (nextIndex <= maxIndex + 1) {
					const yA = yScreen;
					const yB = yNext;
					const midY = (yA + yB) / 2;
					const dist = Math.abs(yB - yA);

					let top: number;
					let bottom: number;

					if (dist > SUMMARY_ROW_HEIGHT * 2 && this.scale > 0.05) {
						top = Math.min(yA, yB) + SUMMARY_MARGIN;
						bottom = Math.max(yA, yB) - SUMMARY_MARGIN;
					} else {
						const band = SUMMARY_ROW_HEIGHT * 2;
						top = midY - band / 2;
						bottom = midY + band / 2;
					}

					const blockHeight = bottom - top;

					if (blockHeight > 0) {
						const maxRows = Math.max(1, Math.floor(blockHeight / SUMMARY_ROW_HEIGHT));
						const itemsPerCol = Math.max(1, Math.min(maxRows, entries.length));
						const cols = Math.ceil(entries.length / itemsPerCol);

						const rightWidth =
							w - (TIMELINE_X + SUMMARY_OFFSET_X) - SUMMARY_RIGHT_MARGIN;
						if (rightWidth > SUMMARY_MIN_WIDTH) {
							const colWidth = Math.min(
								SUMMARY_MAX_COL_WIDTH,
								rightWidth / cols
							);
							const xStart = TIMELINE_X + SUMMARY_OFFSET_X;

							ctx.font = fontSmall;
							ctx.textAlign = "left";

							for (let idx = 0; idx < entries.length; idx++) {
								const col = Math.floor(idx / itemsPerCol);
								const row = idx % itemsPerCol;

								const rowsThisCol = Math.min(
									itemsPerCol,
									entries.length - col * itemsPerCol
								);
								const colTotalH = rowsThisCol * SUMMARY_ROW_HEIGHT;
								const yStartCol = midY - colTotalH / 2;

								const x = xStart + col * colWidth;
								const yItemCenter =
									yStartCol + row * SUMMARY_ROW_HEIGHT + SUMMARY_ROW_HEIGHT / 2;
								const yRectTop = yItemCenter - SUMMARY_ROW_HEIGHT / 2;
								const yRectBottom = yItemCenter + SUMMARY_ROW_HEIGHT / 2;

								const maxWidth = colWidth - 4;

								const isSummaryHover =
									this.hoverSummary &&
									this.hoverSummary.dayIndex === i &&
									this.hoverSummary.itemIndex === idx;
								const summaryColor = isSummaryHover ? colTextHover : colTextBase;

								ctx.fillStyle = summaryColor;

								if (this.scale >= SUMMARY_MIN_SCALE) {
									const text = this.truncate(entries[idx].summary, maxWidth, ctx);
									ctx.fillText(text, x, yItemCenter);
								} else {
									const baseLen = Math.max(10, maxWidth * 0.3);
									const extra =
										(maxWidth - baseLen) * ((idx + 1) / entries.length);
									const len = baseLen + extra;
									ctx.beginPath();
									ctx.moveTo(x, yItemCenter);
									ctx.lineTo(x + len, yItemCenter);
									ctx.strokeStyle = summaryColor;
									ctx.lineWidth = 1;
									ctx.stroke();
								}

								dayLayout.summaryRects.push({
									x1: x,
									y1: yRectTop,
									x2: x + maxWidth,
									y2: yRectBottom,
									itemIndex: idx,
									entry: entries[idx]
								});
							}
						}
					}
				}
			}


			layouts.push(dayLayout);
		}

		this.layouts = layouts;
	}
}
