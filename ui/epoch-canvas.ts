import { MarkdownView, TFile, Menu, Platform } from "obsidian";
import type { EpochIndex, DateEntry } from "../indexer/types";
import { formatDate } from "utils";

import {
	MS_PER_DAY,
	BASE_SPACING,
	DAY_LABEL_MIN_SCALE,
	DAY_DOT_MIN_SCALE,
	MONTH_LABEL_MIN_SCALE,
	MONTH_DOT_MIN_SCALE,
	YEAR_LABEL_MIN_SCALE,
	SUMMARY_MIN_SCALE,
	MIN_SCALE,
	MAX_SCALE,
	ZOOM_INTENSITY,
	VERTICAL_PADDING,
	TIMELINE_X,
	LINE_EXTRA,
	DOT_RADIUS_DAY,
	DOT_RADIUS_MONTH,
	DOT_RADIUS_YEAR,
	TODAY_RADIUS,
	DATE_RECT_HALF_HEIGHT,
	DATE_RECT_RIGHT_EXTRA,
	LABEL_OFFSET_X,
	SUMMARY_MARGIN,
	SUMMARY_ROW_HEIGHT,
	SUMMARY_RIGHT_MARGIN,
	SUMMARY_OFFSET_X,
	SUMMARY_MIN_WIDTH,
	SUMMARY_MAX_COL_WIDTH,
	HOVER_EXTRA_GAP,
	HOVER_BG_PAD,
	TOUCH_HIT_PAD,
	TAP_MAX_DURATION,
	LONG_PRESS_MS,
	DOUBLE_TAP_MAX_DELAY,
	DOUBLE_TAP_MAX_DIST,
	TODAY_OFFSET_Y_INITIAL,
	HOVER_ANIM_SPEED,
	INERTIA_DECAY,
	INERTIA_MIN_VELOCITY,
	INERTIA_BOOST
} from "./epoch-canvas-constants";

import type { DayLayout, HoverOverlay } from "./epoch-canvas-types";
import {
	truncate,
	dist,
	mid,
	mixFont,
	shouldRenderEntry,
	entryFileName
} from "./epoch-canvas-utils";

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

	private mouseDownX = 0;
	private mouseDownY = 0;
	private mouseDownTime = 0;
	private mouseMoved = false;

	private touchMode: "pan" | "pinch" | "hover" | null = null;
	private touchStartY = 0;
	private touchStartOffsetY = 0;
	private pinchStartDist = 0;
	private pinchStartScale = 1;
	private pinchAnchorWorldY = 0;
	private dragSource: "mouse" | "touch" | null = null;

	private touchStartX = 0;
	private touchStartTime = 0;
	private touchMoved = false;
	private touchLongPressTimeout: number | null = null;

	private lastPanY = 0;
	private lastPanTime = 0;
	private velocityY = 0;
	private lastFrameTime: number | null = null;

	private index: EpochIndex = {};

	private layouts: DayLayout[] = [];

	private handleWheel = (e: WheelEvent) => this.onWheel(e);
	private handleMouseDown = (e: MouseEvent) => this.onDown(e);
	private handleMouseMoveWindow = (e: MouseEvent) => this.onMove(e);
	private handleMouseUpWindow = () => this.onUp();
	private handleMouseMoveCanvas = (e: MouseEvent) => this.onHoverMouse(e);
	private handleMouseLeaveCanvas = () => this.clearHover();

	private handleTouchStart = (e: TouchEvent) => this.onTouchStart(e);
	private handleTouchMove = (e: TouchEvent) => this.onTouchMove(e);
	private handleTouchEnd = () => this.onTouchEnd();
	private handleTouchCancel = () => this.onTouchEnd();

	private handleClick = (e: MouseEvent) => this.onClick(e);
	private handleAuxClick = (e: MouseEvent) => this.onAuxClick(e);
	private handleDblClick = (e: MouseEvent) => this.onDblClick(e);
	private handleContextMenu = (e: MouseEvent) => this.onContextMenu(e);

	private hoverDateIndex: number | null = null;
	private hoverSummary: { dayIndex: number; itemIndex: number } | null = null;

	private animDateIndex: number | null = null;
	private animSummary: { dayIndex: number; itemIndex: number } | null = null;

	private hoverAnim = 0;
	private hoverTarget = 0;
	private animFrame: number | null = null;

	private hoverOverlay: HoverOverlay | null = null;
	private focusClearHandle: number | null = null;

	private resizeObserver: ResizeObserver | null = null;

	private animatingView = false;
	private targetScale = 1;
	private targetOffsetY = TODAY_OFFSET_Y_INITIAL;

	private lastTapTime = 0;
	private lastTapX = 0;
	private lastTapY = 0;

	private keepHoverAfterMenu = false;

	constructor(root: HTMLElement, plugin: any) {
		this.root = root;
		this.plugin = plugin;

		this.canvas = root.createEl("canvas");
		this.ctx = this.canvas.getContext("2d")!;

		this.refreshIndex();
		this.bind();

		this.resizeObserver = new ResizeObserver(() => {
			window.requestAnimationFrame(() => this.resize());
		});
		this.resizeObserver.observe(this.root);
	}

	public refreshIndex() {
		this.index = this.plugin.indexer.index as EpochIndex;
		this.draw();
	}

	public initSize() {
		this.resize();
	}

	focusToday() {
		this.scale = 1;
		this.offsetY = TODAY_OFFSET_Y_INITIAL;
		this.hoverDateIndex = null;
		this.hoverSummary = null;
		this.hoverTarget = 0;
		this.hoverAnim = 0;
		this.animDateIndex = null;
		this.animSummary = null;
		this.draw();
	}

	private focusDate(date: Date, highlight: boolean = false) {
		const rect = this.root.getBoundingClientRect();
		if (!rect.height) return;

		const today = this.getToday();
		const diffDays = Math.round(
			(today.getTime() - date.getTime()) / MS_PER_DAY
		);
		const worldY = diffDays * BASE_SPACING;
		const centerY = rect.height / 2;

		this.targetScale = this.scale;
		this.targetOffsetY = centerY - worldY * this.scale;
		this.animatingView = true;

		if (highlight) {
			this.cancelFocusClear();
			this.hoverSummary = null;
			this.hoverDateIndex = diffDays;
			this.animSummary = null;
			this.animDateIndex = diffDays;
			this.hoverTarget = 1;
			this.focusClearHandle = window.setTimeout(() => {
				this.focusClearHandle = null;
				this.clearHover();
			}, 750);
		}

		this.requestHoverAnimation();
	}

	private bind() {
		this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
		this.canvas.addEventListener("mousedown", this.handleMouseDown);
		this.canvas.addEventListener("dblclick", this.handleDblClick);
		this.canvas.addEventListener("contextmenu", this.handleContextMenu);
		window.addEventListener("mousemove", this.handleMouseMoveWindow);
		window.addEventListener("mouseup", this.handleMouseUpWindow);

		this.canvas.addEventListener("mousemove", this.handleMouseMoveCanvas);
		this.canvas.addEventListener("mouseleave", this.handleMouseLeaveCanvas);

		this.canvas.addEventListener("touchstart", this.handleTouchStart, {
			passive: false
		});
		this.canvas.addEventListener("touchmove", this.handleTouchMove, {
			passive: false
		});
		this.canvas.addEventListener("touchend", this.handleTouchEnd);
		this.canvas.addEventListener("touchcancel", this.handleTouchCancel);

		this.canvas.addEventListener("click", this.handleClick);
		this.canvas.addEventListener("auxclick", this.handleAuxClick);
	}

	private resize() {
		const rect = this.root.getBoundingClientRect();
		const width = rect.width || this.root.clientWidth;
		const height = rect.height || this.root.clientHeight;

		if (!width || !height) return;

		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = width * dpr;
		this.canvas.height = height * dpr;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.draw();
	}

	private onWheel(e: WheelEvent) {
		e.preventDefault();
		this.animatingView = false;
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
		this.animatingView = false;
		if (e.button === 1) {
			e.preventDefault();
			return;
		}
		if (e.button !== 0) return;

		this.isDragging = true;
		this.dragSource = "mouse";
		this.dragStartY = e.clientY;
		this.dragStartOffsetY = this.offsetY;

		this.lastPanY = e.clientY;
		this.lastPanTime = performance.now();
		this.velocityY = 0;

		this.mouseDownX = e.clientX;
		this.mouseDownY = e.clientY;
		this.mouseDownTime = performance.now();
		this.mouseMoved = false;
	}

	private onMove(e: MouseEvent) {
		if (!this.isDragging) return;
		const now = performance.now();
		const dy = e.clientY - this.dragStartY;
		this.offsetY = this.dragStartOffsetY + dy;

		const dt = now - this.lastPanTime;
		if (dt > 0) {
			const dyStep = e.clientY - this.lastPanY;
			if (this.dragSource === "touch") {
				this.velocityY = dyStep / dt;
			} else {
				this.velocityY = 0;
			}
			this.lastPanY = e.clientY;
			this.lastPanTime = now;
		}

		const distVal = Math.hypot(
			e.clientX - this.mouseDownX,
			e.clientY - this.mouseDownY
		);
		if (distVal > 8) this.mouseMoved = true;

		this.draw();
	}

	private onUp() {
		if (!this.isDragging) return;
		this.isDragging = false;
		this.dragSource = null;
		this.velocityY = 0;
	}

	private onHoverMouse(e: MouseEvent) {
		const rect = this.canvas.getBoundingClientRect();
		this.updateHover(e.clientX - rect.left, e.clientY - rect.top);
	}

	private onTouchStart(e: TouchEvent) {
		e.preventDefault();
		this.animatingView = false;

		if (this.keepHoverAfterMenu) {
			this.keepHoverAfterMenu = false;
			this.clearHover();
		}

		if (e.touches.length === 1) {
			const t = e.touches[0];

			this.touchMode = null;
			this.touchStartX = t.clientX;
			this.touchStartY = t.clientY;
			this.touchStartOffsetY = this.offsetY;
			this.touchStartTime = Date.now();
			this.touchMoved = false;

			this.lastPanY = t.clientY;
			this.lastPanTime = performance.now();
			this.velocityY = 0;

			if (this.touchLongPressTimeout != null) {
				clearTimeout(this.touchLongPressTimeout);
			}
			this.touchLongPressTimeout = window.setTimeout(() => {
				const rect = this.canvas.getBoundingClientRect();
				const x = this.touchStartX - rect.left;
				const y = this.touchStartY - rect.top;
				const entry = this.findSummaryEntryAtPoint(x, y);
				if (entry) {
					this.keepHoverAfterMenu = true;
					this.touchMode = null;
					this.updateHover(x, y);
					this.showSummaryMenu(entry, this.touchStartX, this.touchStartY);
					return;
				}
				this.touchMode = "hover";
				this.updateHover(x, y);
			}, LONG_PRESS_MS);
		} else if (e.touches.length === 2) {
			if (this.touchLongPressTimeout != null) {
				clearTimeout(this.touchLongPressTimeout);
				this.touchLongPressTimeout = null;
			}

			const t1 = e.touches.item(0);
			const t2 = e.touches.item(1);
			if (!t1 || !t2) return;
			this.touchMode = "pinch";
			this.pinchStartDist = dist(t1, t2);
			this.pinchStartScale = this.scale;

			const rect = this.canvas.getBoundingClientRect();
			const m = mid(t1, t2);
			const midY = m.y - rect.top;
			this.pinchAnchorWorldY = (midY - this.offsetY) / this.scale;
		}
	}

	private onTouchMove(e: TouchEvent) {
		e.preventDefault();

		if (e.touches.length === 2) {
			if (this.touchLongPressTimeout != null) {
				clearTimeout(this.touchLongPressTimeout);
				this.touchLongPressTimeout = null;
			}
			const t1 = e.touches.item(0);
			const t2 = e.touches.item(1);
			if (!t1 || !t2) return;
			const rect = this.canvas.getBoundingClientRect();
			const m = mid(t1, t2);
			const midY = m.y - rect.top;

			const newDist = dist(t1, t2);
			let newScale = this.pinchStartScale * (newDist / this.pinchStartDist);
			newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

			this.touchMode = "pinch";
			this.scale = newScale;
			this.offsetY = midY - this.pinchAnchorWorldY * this.scale;
			this.draw();
			return;
		}

		if (e.touches.length !== 1) return;

		const t = e.touches[0];
		const dx = t.clientX - this.touchStartX;
		const dy = t.clientY - this.touchStartY;
		const distVal = Math.hypot(dx, dy);

		if (!this.touchMoved && distVal > 8) {
			this.touchMoved = true;
			if (this.touchLongPressTimeout != null) {
				clearTimeout(this.touchLongPressTimeout);
				this.touchLongPressTimeout = null;
			}
			if (this.touchMode !== "hover") {
				this.touchMode = "pan";
				this.dragSource = "touch";
			}
			this.touchStartY = t.clientY;
			this.touchStartOffsetY = this.offsetY;
		}

		if (this.touchMode === "pan") {
			const dyPan = t.clientY - this.touchStartY;
			this.offsetY = this.touchStartOffsetY + dyPan;

			const now = performance.now();
			const dt = now - this.lastPanTime;
			if (dt > 0) {
				const dyStep = t.clientY - this.lastPanY;
				this.velocityY = dyStep / dt;
				this.lastPanY = t.clientY;
				this.lastPanTime = now;
			}

			const rect = this.canvas.getBoundingClientRect();
			this.updateHover(t.clientX - rect.left, t.clientY - rect.top);
			this.draw();
		} else if (this.touchMode === "hover") {
			const rect = this.canvas.getBoundingClientRect();
			this.updateHover(t.clientX - rect.left, t.clientY - rect.top);
		}
	}

	private async onTouchEnd() {
		if (this.touchLongPressTimeout != null) {
			clearTimeout(this.touchLongPressTimeout);
			this.touchLongPressTimeout = null;
		}

		const duration = Date.now() - this.touchStartTime;
		const mode = this.touchMode;

		if (mode === "hover") {
			if (!this.keepHoverAfterMenu) {
				this.clearHover();
			}
			this.touchMode = null;
			this.keepHoverAfterMenu = false;
			return;
		}

		let didTap = false;

		if (!this.touchMoved && duration < TAP_MAX_DURATION) {
			const rect = this.canvas.getBoundingClientRect();
			const x = this.touchStartX - rect.left;
			const y = this.touchStartY - rect.top;

			const now = Date.now();
			const dtTap = now - this.lastTapTime;
			const distVal = Math.hypot(x - this.lastTapX, y - this.lastTapY);

			if (dtTap < DOUBLE_TAP_MAX_DELAY && distVal < DOUBLE_TAP_MAX_DIST) {
				await this.handleDoublePoint(x, y);
				this.lastTapTime = 0;
			} else {
				await this.handleTapWithHover(x, y);
				this.lastTapTime = now;
				this.lastTapX = x;
				this.lastTapY = y;
			}
			didTap = true;
		}

		this.touchMode = null;

		if (mode === "pan") {
			this.startInertia();
		}

		if (!didTap) {
			if (!this.keepHoverAfterMenu) {
				this.clearHover();
			}
			this.keepHoverAfterMenu = false;
		}

		this.dragSource = null;
	}

	private async onClick(e: MouseEvent) {
		const now = performance.now();
		const dt = now - this.mouseDownTime;

		if (this.mouseMoved || dt > TAP_MAX_DURATION) {
			return;
		}

		const rect = this.canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const isMiddle = e.button === 1;
		await this.handlePointClick(
			x,
			y,
			isMiddle || e.ctrlKey,
			e.metaKey
		);
	}

	private async onDblClick(e: MouseEvent) {
		const rect = this.canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		await this.handleDoublePoint(x, y);
	}

	private async onAuxClick(e: MouseEvent) {
		if (e.button !== 1) return;

		e.preventDefault();

		const rect = this.canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		await this.handlePointClick(x, y, true, e.metaKey);
	}

	private onContextMenu(e: MouseEvent) {
		e.preventDefault();
		const rect = this.canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const entry = this.findSummaryEntryAtPoint(x, y);
		if (!entry) return;

		this.showSummaryMenu(entry, e.clientX, e.clientY);
	}

	private async handlePointClick(
		x: number,
		y: number,
		ctrlKey: boolean,
		metaKey: boolean
	) {
		for (const d of this.layouts) {
			for (const s of d.summaryRects) {
				if (x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2) {
					await this.openEntry(s.entry, { ctrlKey, metaKey } as any);
					return;
				}
			}
		}

		for (const d of this.layouts) {
			if (!d.hasVisibleDate) continue;
			const r = d.dateRect;
			if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
				const today = this.getToday();
				const date = this.getDateForIndex(d.index, today);
				await this.openDateNote(date, { ctrlKey, metaKey } as any);
				return;
			}
		}
	}

	private async handleTapWithHover(x: number, y: number) {
		for (const d of this.layouts) {
			for (const s of d.summaryRects) {
				if (x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2) {
					this.hoverSummary = { dayIndex: d.index, itemIndex: s.itemIndex };
					this.hoverDateIndex = null;
					this.animSummary = { dayIndex: d.index, itemIndex: s.itemIndex };
					this.animDateIndex = null;
					this.canvas.style.cursor = "pointer";
					this.hoverTarget = 1;
					this.requestHoverAnimation();

					await new Promise(r => setTimeout(r, 120));
					await this.openEntry(s.entry, { ctrlKey: false, metaKey: false } as any);
					this.clearHover();
					return;
				}
			}
		}

		for (const d of this.layouts) {
			if (!d.hasVisibleDate) continue;
			const r = d.dateRect;
			if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
				this.hoverSummary = null;
				this.hoverDateIndex = d.index;
				this.animSummary = null;
				this.animDateIndex = d.index;
				this.canvas.style.cursor = "pointer";
				this.hoverTarget = 1;
				this.requestHoverAnimation();

				await new Promise(r => setTimeout(r, 120));
				const today = this.getToday();
				const date = this.getDateForIndex(d.index, today);
				await this.openDateNote(date);
				this.clearHover();
				return;
			}
		}
	}

	private async handleDoublePoint(x: number, y: number) {
		const summaryEntry = this.findSummaryEntryAtPoint(x, y);
		if (summaryEntry) {
			await this.openEntry(summaryEntry, { ctrlKey: false, metaKey: false } as any);
			return;
		}

		const day = this.findDayLayoutAtPoint(x, y);
		if (day) {
			const today = this.getToday();
			const date = this.getDateForIndex(day.index, today);
			await this.createNoteForDate(date, false);
			return;
		}

		this.animateToToday();
	}

	private async createNoteForDate(date: Date, focus: boolean = true) {
		const app = this.plugin.app;

		const existing = this.getFileForDate(date);
		if (existing) {
			await this.openFileAtLine(existing.path, 0);
			if (focus) this.focusDate(date, true);
			return;
		}

		const { folder, baseName } = this.getNotePathParts(date);
		const expectedPath = this.getExpectedNotePath(date);
		let path = expectedPath;

		let counter = 1;
		while (app.vault.getAbstractFileByPath(path)) {
			const suffix = ` ${counter++}`;
			path = folder ? `${folder}/${baseName}${suffix}.md` : `${baseName}${suffix}.md`;
		}

		const file = await app.vault.create(path, "");
		await this.openFileAtLine(file.path, 0);
		if (focus) this.focusDate(date, true);
	}

	private async openDateNote(date: Date, ev?: MouseEvent, focus: boolean = true) {
		const file = this.getFileForDate(date);
		if (!file) return;
		await this.openFileAtLine(file.path, 0, ev);
		if (focus) this.focusDate(date, true);
	}

	private async openFileAtLine(filePath: string, line: number = 0, ev?: MouseEvent) {
		const app = this.plugin.app;
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		let leaf: any;

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
		// @ts-ignore
		await leaf.openFile(file);
		app.workspace.setActiveLeaf(leaf, true);

		if (Platform.isMobileApp) {
			const ws: any = app.workspace;
			if (ws.rightSplit && typeof ws.rightSplit.collapse === "function") {
				ws.rightSplit.collapse();
			}
		}

		const view = leaf.view as MarkdownView | null;
		if (!view) return;

		const safeLine = Math.max(0, line);
		view.editor.focus();
		view.editor.setCursor({ line: safeLine, ch: 0 });
		// @ts-ignore
		view.editor.scrollIntoView(
			{ from: { line: safeLine, ch: 0 }, to: { line: safeLine, ch: 0 } },
			true
		);
	}


	private async openEntry(entry: DateEntry, ev?: MouseEvent) {
		const line = Math.max(0, entry.blockStart ?? 0);
		await this.openFileAtLine(entry.file, line, ev);
	}

	private async deleteEntryFile(entry: DateEntry) {
		const app = this.plugin.app;
		const file = app.vault.getAbstractFileByPath(entry.file);
		if (!(file instanceof TFile)) return;

		await app.vault.delete(file);

		for (const key in this.index) {
			this.index[key] = this.index[key].filter(e => e.file !== entry.file);
			if (this.index[key].length === 0) delete this.index[key];
		}
		this.draw();
	}

	private showSummaryMenu(entry: DateEntry, clientX: number, clientY: number) {
		const menu = new Menu();
		menu.addItem(item => {
			item
				.setTitle("Delete")
				.onClick(async () => {
					await this.deleteEntryFile(entry);
				});
		});
		menu.showAtPosition({ x: clientX, y: clientY });
	}

	private startInertia() {
		if (Math.abs(this.velocityY) < 0.01) return;
		this.lastFrameTime = null;
		this.requestHoverAnimation();
	}

	private cancelFocusClear() {
		if (this.focusClearHandle != null) {
			window.clearTimeout(this.focusClearHandle);
			this.focusClearHandle = null;
		}
	}

	private clearHover() {
		this.cancelFocusClear();
		if (this.hoverDateIndex == null && this.hoverSummary == null) return;
		this.hoverDateIndex = null;
		this.hoverSummary = null;
		this.canvas.style.cursor = "default";
		this.hoverTarget = 0;
		this.requestHoverAnimation();
	}

	private updateHover(x: number, y: number) {
		this.cancelFocusClear();
		for (const d of this.layouts) {
			for (const s of d.summaryRects) {
				if (x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2) {
					this.hoverSummary = { dayIndex: d.index, itemIndex: s.itemIndex };
					this.hoverDateIndex = null;
					this.animSummary = { dayIndex: d.index, itemIndex: s.itemIndex };
					this.animDateIndex = null;
					this.canvas.style.cursor = "pointer";
					this.hoverTarget = 1;
					this.requestHoverAnimation();
					return;
				}
			}
		}

		let newDateIndex: number | null = null;
		for (const d of this.layouts) {
			if (!d.hasVisibleDate) continue;
			const r = d.dateRect;
			if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
				newDateIndex = d.index;
				break;
			}
		}

		if (newDateIndex != null) {
			this.hoverSummary = null;
			this.hoverDateIndex = newDateIndex;
			this.animSummary = null;
			this.animDateIndex = newDateIndex;
			this.canvas.style.cursor = "pointer";
			this.hoverTarget = 1;
			this.requestHoverAnimation();
		} else {
			if (this.hoverSummary != null || this.hoverDateIndex != null) {
				this.hoverSummary = null;
				this.hoverDateIndex = null;
				this.canvas.style.cursor = "default";
				this.hoverTarget = 0;
				this.requestHoverAnimation();
			}
		}
	}

	private findSummaryEntryAtPoint(x: number, y: number): DateEntry | null {
		for (const d of this.layouts) {
			for (const s of d.summaryRects) {
				if (x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2) {
					return s.entry;
				}
			}
		}
		return null;
	}

	private findDayLayoutAtPoint(x: number, y: number): DayLayout | null {
		for (const d of this.layouts) {
			if (!d.hasVisibleDate) continue;
			const r = d.dateRect;
			if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
				return d;
			}
		}
		return null;
	}

	private getToday(): Date {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}

	private getDateForIndex(i: number, today: Date): Date {
		return new Date(today.getTime() - i * MS_PER_DAY);
	}

	private getEntryTitle(entry: DateEntry): string {
		const file = this.plugin.app.vault.getAbstractFileByPath(entry.file);
		if (file instanceof TFile) {
			return file.name;
		}
		return entry.file;
	}

	private getNoteNameForDate(date: Date): string {
		if (this.plugin && typeof this.plugin.getDateFormat === "function") {
			return this.plugin.getDateFormat(date);
		}
		return formatDate(date);
	}

	private getNotePathParts(date: Date): { folder: string; baseName: string } {
		const baseName = this.getNoteNameForDate(date) || formatDate(date);
		const rawFolder = this.plugin.settings?.newNotePath || "";
		const folder = rawFolder.trim().replace(/\\/g, "/").replace(/\/+$/, "");
		return { folder, baseName };
	}

	private getExpectedNotePath(date: Date): string {
		const { folder, baseName } = this.getNotePathParts(date);
		return folder ? `${folder}/${baseName}.md` : `${baseName}.md`;
	}

	private getFileForDate(date: Date): TFile | null {
		const app = this.plugin.app;
		const path = this.getExpectedNotePath(date);
		const direct = app.vault.getAbstractFileByPath(path);
		return direct instanceof TFile ? direct : null;
	}

	private requestHoverAnimation() {
		if (this.animFrame != null) return;
		this.animFrame = requestAnimationFrame(() => this.animate());
	}

	private animate() {
		this.animFrame = null;

		const now = performance.now();
		let dt = 0;
		if (this.lastFrameTime != null) {
			dt = now - this.lastFrameTime;
		}
		this.lastFrameTime = now;

		const target = this.hoverTarget;
		this.hoverAnim += (target - this.hoverAnim) * HOVER_ANIM_SPEED;

		if (Math.abs(target - this.hoverAnim) < 0.01) {
			this.hoverAnim = target;
			if (target === 0) {
				this.animDateIndex = null;
				this.animSummary = null;
			}
		}

		if (dt > 0 && Math.abs(this.velocityY) > 0) {
			const friction = Math.pow(INERTIA_DECAY, dt / 16.67);
			this.offsetY += this.velocityY * dt * INERTIA_BOOST;
			this.velocityY *= friction;
			if (Math.abs(this.velocityY) < INERTIA_MIN_VELOCITY) {
				this.velocityY = 0;
			}
		}

		if (dt > 0 && this.animatingView) {
			const t = Math.min(1, dt / 200);
			this.scale += (this.targetScale - this.scale) * t;
			this.offsetY += (this.targetOffsetY - this.offsetY) * t;

			if (
				Math.abs(this.scale - this.targetScale) < 0.001 &&
				Math.abs(this.offsetY - this.targetOffsetY) < 0.5
			) {
				this.scale = this.targetScale;
				this.offsetY = this.targetOffsetY;
				this.animatingView = false;
			}
		}

		const stillHover = Math.abs(target - this.hoverAnim) >= 0.01;
		const stillInertia = Math.abs(this.velocityY) >= 0.01;
		const stillView = this.animatingView;

		if (stillHover || stillInertia || stillView) {
			this.requestHoverAnimation();
		} else {
			this.lastFrameTime = null;
		}

		this.draw();
	}

	private animateToToday() {
		this.targetScale = 1;
		this.targetOffsetY = TODAY_OFFSET_Y_INITIAL;
		this.animatingView = true;
		this.requestHoverAnimation();
	}

	private draw() {
		const ctx = this.ctx;
		if (!this.canvas) return;

		const rect = this.root.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if (!w || !h) return;

		ctx.clearRect(0, 0, w, h);

		const css = getComputedStyle(this.root);
		const colLine = css.getPropertyValue("--epoch-line-color").trim();
		const colTextBase = css.getPropertyValue("--epoch-text-color").trim();
		const colTextHover = css.getPropertyValue("--epoch-text-color-hover").trim();
		const colToday = css.getPropertyValue("--epoch-today-color").trim();
		const fontMain = css.getPropertyValue("--epoch-font-main");
		const fontMainHover = css.getPropertyValue("--epoch-font-main-hover") || fontMain;
		const fontSmall = css.getPropertyValue("--epoch-font-small");
		const fontSmallHover =
			css.getPropertyValue("--epoch-font-small-hover") || fontSmall;
		const colSummaryHoverBg =
			css.getPropertyValue("--epoch-bg").trim();

		this.hoverOverlay = null;

		ctx.strokeStyle = colLine;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(TIMELINE_X, -LINE_EXTRA);
		ctx.lineTo(TIMELINE_X, h + LINE_EXTRA);
		ctx.stroke();

		const today = this.getToday();

		const minScreenY = -VERTICAL_PADDING;
		const maxScreenY = h + VERTICAL_PADDING;

		const minIndex = Math.floor(
			(minScreenY - this.offsetY) / (BASE_SPACING * this.scale)
		);
		const maxIndex = Math.ceil(
			(maxScreenY - this.offsetY) / (BASE_SPACING * this.scale)
		);

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

			const key = formatDate(date);
			const rawEntries = this.index[key] || [];
			const entries = rawEntries.filter(shouldRenderEntry);

			let label: string | null = null;
			let kind: "day" | "month" | "year" = "day";

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

			const dateHoverT =
				this.animDateIndex === i ? this.hoverAnim : 0;

			const dateColor =
				dateHoverT > 0 ? colTextHover : colTextBase;
			const dateFont = mixFont(fontMain, fontMainHover, dateHoverT);

			const hasVisibleDate = showDot || !!label || isToday;

			if (!hasVisibleDate && entries.length === 0 && this.scale < DAY_LABEL_MIN_SCALE) {
				continue;
			}

			const dateRect = {
				x1: TIMELINE_X - (LABEL_OFFSET_X + 40),
				y1: yScreen - DATE_RECT_HALF_HEIGHT,
				x2: TIMELINE_X + DATE_RECT_RIGHT_EXTRA,
				y2: yScreen + DATE_RECT_HALF_HEIGHT
			};

			const dayLayout: DayLayout = {
				index: i,
				y: yScreen,
				kind,
				dateRect,
				summaryRects: [],
				hasVisibleDate
			};

			if (showDot) {
				ctx.fillStyle = dateColor;
				ctx.beginPath();
				ctx.arc(TIMELINE_X, yScreen, dotRadius, 0, Math.PI * 2);
				ctx.fill();
			}

			if (label) {
				ctx.fillStyle = dateColor;
				ctx.font = dateFont;
				ctx.textAlign = "right";
				const extra = 4 * dateHoverT;
				ctx.fillText(label, TIMELINE_X - LABEL_OFFSET_X - extra, yScreen);
			}

			if (isToday) {
				const radius = TODAY_RADIUS + 3 * dateHoverT;

				ctx.beginPath();
				ctx.arc(TIMELINE_X, yScreen, radius, 0, Math.PI * 2);
				if (dateHoverT > 0) {
					ctx.fillStyle = colToday;
					ctx.fill();
				} else {
					ctx.strokeStyle = colToday;
					ctx.lineWidth = 2;
					ctx.stroke();
				}
			}

			if (entries.length > 0) {
				const halfSpan = Math.max(
					SUMMARY_ROW_HEIGHT / 2,
					(BASE_SPACING * this.scale) / 2 - SUMMARY_MARGIN
				);
				const bandHeight = Math.max(SUMMARY_ROW_HEIGHT, halfSpan * 2);
				const maxRows = Math.max(
					1,
					Math.floor(bandHeight / SUMMARY_ROW_HEIGHT)
				);
				const itemsPerCol = Math.max(
					1,
					Math.min(maxRows, entries.length)
				);
				const columnCount = Math.ceil(entries.length / itemsPerCol);
				const hoverIdxForDay =
					this.animSummary && this.animSummary.dayIndex === i
						? this.animSummary.itemIndex
						: -1;

				const rightWidth =
					w - (TIMELINE_X + SUMMARY_OFFSET_X) - SUMMARY_RIGHT_MARGIN;

				if (rightWidth > SUMMARY_MIN_WIDTH) {
					const colWidth = Math.min(SUMMARY_MAX_COL_WIDTH, rightWidth / columnCount);
					const xStart = TIMELINE_X + SUMMARY_OFFSET_X;

					ctx.textAlign = "left";

					for (let col = 0; col < columnCount; col++) {
						const startIndex = col * itemsPerCol;
						if (startIndex >= entries.length) break;
						const endIndex = Math.min(startIndex + itemsPerCol, entries.length);
						const rowsThisCol = endIndex - startIndex;
						const hoverRowInCol =
							hoverIdxForDay >= startIndex && hoverIdxForDay < endIndex
								? hoverIdxForDay - startIndex
								: -1;
						const hasHoverInCol = hoverRowInCol >= 0 && rowsThisCol > 0;
						const gapHalf = hasHoverInCol
							? (HOVER_EXTRA_GAP / 2) * this.hoverAnim
							: 0;

						let columnHeight = rowsThisCol * SUMMARY_ROW_HEIGHT;
						if (hasHoverInCol && rowsThisCol > 1) {
							if (hoverRowInCol > 0) columnHeight += gapHalf;
							if (hoverRowInCol < rowsThisCol - 1) columnHeight += gapHalf;
						}

						const yStartCol = yScreen - columnHeight / 2;
						let yCursor = yStartCol;

						for (let row = 0; row < rowsThisCol; row++) {
							if (hasHoverInCol && row === hoverRowInCol && row > 0) {
								yCursor += gapHalf;
							}

							const entryIndex = startIndex + row;
							const entry = entries[entryIndex];
							const x = xStart + col * colWidth;
							const yItemCenter = yCursor + SUMMARY_ROW_HEIGHT / 2;
							const yRectTop = yItemCenter - SUMMARY_ROW_HEIGHT / 2;
							const yRectBottom = yItemCenter + SUMMARY_ROW_HEIGHT / 2;

							const maxWidth = colWidth - 4;

							const summaryHoverT =
								this.animSummary &&
								this.animSummary.dayIndex === i &&
								this.animSummary.itemIndex === entryIndex
									? this.hoverAnim
									: 0;

							const summaryColor =
								summaryHoverT > 0 ? colTextHover : colTextBase;

							const rawSummary = (entry.summary || "").trim();
							const title = this.getEntryTitle(entry) || entryFileName(entry);
							const isFallbackSummary = rawSummary.length > 0 && rawSummary === title;
							const effectiveSummary = isFallbackSummary ? "" : rawSummary;
							const hasRealSummary = effectiveSummary.length > 0;
							const icon = entry.source === "content" && hasRealSummary ? " 🖋" : "";
							let renderText: string;
							let hoverText: string;
							let truncatedWidth = 0;

							ctx.save();
							ctx.font = fontSmall;

							if (effectiveSummary.length > 0) {
								const full = effectiveSummary + icon;
								if (ctx.measureText(full).width <= maxWidth) {
									renderText = full;
								} else {
									const ell = "...";
									let low = 0;
									let high = effectiveSummary.length;
									while (low < high) {
										const mid = (low + high) >> 1;
										const candidate = effectiveSummary.slice(0, mid) + ell + icon;
										if (ctx.measureText(candidate).width <= maxWidth) {
											low = mid + 1;
										} else {
											high = mid;
										}
									}
									const len = Math.max(0, low - 1);
									renderText = effectiveSummary.slice(0, len) + ell + icon;
								}

								truncatedWidth = ctx.measureText(renderText).width;
								const hoverSuffix = title ? `  ·  ${title}` : "";
								hoverText = effectiveSummary + icon + hoverSuffix;
							} else {
								const iconWidth = icon ? ctx.measureText(icon).width : 0;
								const available = Math.max(0, maxWidth - iconWidth);
								const truncatedTitle = available > 0 ? truncate(title, available, ctx) : "";
								renderText = truncatedTitle + icon;
								truncatedWidth = ctx.measureText(truncatedTitle).width + iconWidth;
								hoverText = renderText;
							}

							ctx.restore();

							if (this.scale >= SUMMARY_MIN_SCALE) {
								if (summaryHoverT > 0) {
									const hoverFontStr = mixFont(
										fontSmall,
										fontSmallHover,
										summaryHoverT
									);

									ctx.save();
									ctx.font = hoverFontStr;
									const textWidth = ctx.measureText(hoverText).width;
									ctx.restore();

									this.hoverOverlay = {
										x,
										yTop: yRectTop,
										yBottom: yRectBottom,
										yCenter: yItemCenter,
										width: textWidth + HOVER_BG_PAD * 2,
										text: hoverText,
										font: hoverFontStr
									};
								} else {
									ctx.fillStyle = summaryColor;
									ctx.font = fontSmall;
									ctx.fillText(renderText, x, yItemCenter);
								}
							} else {
								ctx.strokeStyle = summaryColor;
								ctx.lineWidth = 1;
								const len = Math.max(10, Math.min(maxWidth, truncatedWidth));
								ctx.beginPath();
								ctx.moveTo(x, yItemCenter);
								ctx.lineTo(x + len, yItemCenter);
								ctx.stroke();
							}

							dayLayout.summaryRects.push({
								x1: x - TOUCH_HIT_PAD,
								y1: yRectTop - TOUCH_HIT_PAD,
								x2: x + maxWidth + TOUCH_HIT_PAD,
								y2: yRectBottom + TOUCH_HIT_PAD,
								itemIndex: entryIndex,
								entry
							});

							yCursor += SUMMARY_ROW_HEIGHT;
							if (hasHoverInCol && row === hoverRowInCol && row < rowsThisCol - 1) {
								yCursor += gapHalf;
							}
						}
					}
				}
			}

			layouts.push(dayLayout);
		}

		if (this.hoverOverlay && this.scale >= SUMMARY_MIN_SCALE && this.hoverAnim > 0) {
			const ho = this.hoverOverlay;
			ctx.fillStyle = colSummaryHoverBg;
			ctx.fillRect(
				ho.x - HOVER_BG_PAD,
				ho.yTop - HOVER_BG_PAD,
				ho.width,
				(ho.yBottom - ho.yTop) + HOVER_BG_PAD * 2
			);

			ctx.fillStyle = colTextHover;
			ctx.font = ho.font;
			ctx.textAlign = "left";
			ctx.fillText(ho.text, ho.x, ho.yCenter);
		}

		this.layouts = layouts;
	}

	public destroy() {
		this.cancelFocusClear();
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		this.canvas.removeEventListener("wheel", this.handleWheel);
		this.canvas.removeEventListener("mousedown", this.handleMouseDown);
		this.canvas.removeEventListener("dblclick", this.handleDblClick);
		this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
		window.removeEventListener("mousemove", this.handleMouseMoveWindow);
		window.removeEventListener("mouseup", this.handleMouseUpWindow);

		this.canvas.removeEventListener("mousemove", this.handleMouseMoveCanvas);
		this.canvas.removeEventListener("mouseleave", this.handleMouseLeaveCanvas);

		this.canvas.removeEventListener("touchstart", this.handleTouchStart);
		this.canvas.removeEventListener("touchmove", this.handleTouchMove);
		this.canvas.removeEventListener("touchend", this.handleTouchEnd);
		this.canvas.removeEventListener("touchcancel", this.handleTouchCancel);

		this.canvas.removeEventListener("click", this.handleClick);
		this.canvas.removeEventListener("auxclick", this.handleAuxClick);

		if (this.animFrame != null) {
			cancelAnimationFrame(this.animFrame);
			this.animFrame = null;
		}

		if (this.touchLongPressTimeout != null) {
			clearTimeout(this.touchLongPressTimeout);
			this.touchLongPressTimeout = null;
		}
	}
}