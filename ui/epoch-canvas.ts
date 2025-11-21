import { MarkdownView, TFile } from "obsidian";
import type { EpochIndex, DateEntry } from "../indexer/types";
import { formatDate } from "utils";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE_SPACING = 40;

const DAY_LABEL_MIN_SCALE = 0.35;
const DAY_DOT_MIN_SCALE = 0.2;
const MONTH_LABEL_MIN_SCALE = 0.03;
const MONTH_DOT_MIN_SCALE = 0.02;
const YEAR_LABEL_MIN_SCALE = 0.001;
const SUMMARY_MIN_SCALE = 0.5;

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

const HOVER_EXTRA_GAP = 6;
const HOVER_BG_PAD = 5;
const TOUCH_HIT_PAD = 5;
const TAP_MAX_DURATION = 200;
const LONG_PRESS_MS = 200;

const TODAY_OFFSET_Y_INITIAL = 80;
const HOVER_ANIM_SPEED = 0.5;

const INERTIA_DECAY = 0.94;
const INERTIA_MIN_VELOCITY = 0.01;
const INERTIA_BOOST = 1;

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

interface HoverOverlay {
	x: number;
	yTop: number;
	yBottom: number;
	yCenter: number;
	width: number;
	text: string;
	font: string;
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

	private hoverDateIndex: number | null = null;
	private hoverSummary: { dayIndex: number; itemIndex: number } | null = null;

	private animDateIndex: number | null = null;
	private animSummary: { dayIndex: number; itemIndex: number } | null = null;

	private hoverAnim = 0;
	private hoverTarget = 0;
	private animFrame: number | null = null;

	private hoverOverlay: HoverOverlay | null = null;

	private resizeObserver: ResizeObserver | null = null;

	constructor(root: HTMLElement, plugin: any) {
		this.root = root;
		this.plugin = plugin;

		this.canvas = root.createEl("canvas");
		this.ctx = this.canvas.getContext("2d")!;

		this.loadIndex();
		this.bind();

		this.resizeObserver = new ResizeObserver(() => {
			window.requestAnimationFrame(() => this.resize());
		});
		this.resizeObserver.observe(this.root);
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

	private loadIndex() {
		this.index = this.plugin.indexer.index as EpochIndex;
	}

	private bind() {
		this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
		this.canvas.addEventListener("mousedown", this.handleMouseDown);
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
			this.velocityY = dyStep / dt; // px/ms
			this.lastPanY = e.clientY;
			this.lastPanTime = now;
		}

		const dist = Math.hypot(
			e.clientX - this.mouseDownX,
			e.clientY - this.mouseDownY
		);
		if (dist > 8) this.mouseMoved = true;

		this.draw();
	}

	private onUp() {
		this.isDragging = false;
		this.velocityY = 0;
	}

	private onHoverMouse(e: MouseEvent) {
		const rect = this.canvas.getBoundingClientRect();
		this.updateHover(e.clientX - rect.left, e.clientY - rect.top);
	}

	private onTouchStart(e: TouchEvent) {
		e.preventDefault();

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
				this.touchMode = "hover";
				const rect = this.canvas.getBoundingClientRect();
				this.updateHover(
					this.touchStartX - rect.left,
					this.touchStartY - rect.top
				);
			}, LONG_PRESS_MS);
		} else if (e.touches.length === 2) {
			if (this.touchLongPressTimeout != null) {
				clearTimeout(this.touchLongPressTimeout);
				this.touchLongPressTimeout = null;
			}

			const [t1, t2] = e.touches;
			this.touchMode = "pinch";
			this.pinchStartDist = this.dist(t1, t2);
			this.pinchStartScale = this.scale;

			const rect = this.canvas.getBoundingClientRect();
			const m = this.mid(t1, t2);
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
			const [t1, t2] = e.touches;
			const rect = this.canvas.getBoundingClientRect();
			const m = this.mid(t1, t2);
			const midY = m.y - rect.top;

			const newDist = this.dist(t1, t2);
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
		const dist = Math.hypot(dx, dy);

		if (!this.touchMoved && dist > 8) {
			this.touchMoved = true;
			if (this.touchLongPressTimeout != null) {
				clearTimeout(this.touchLongPressTimeout);
				this.touchLongPressTimeout = null;
			}
			if (this.touchMode !== "hover") {
				this.touchMode = "pan";
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
			this.clearHover();
			this.touchMode = null;
			return;
		}

		let didTap = false;

		if (!this.touchMoved && duration < TAP_MAX_DURATION) {
			const rect = this.canvas.getBoundingClientRect();
			const x = this.touchStartX - rect.left;
			const y = this.touchStartY - rect.top;
			await this.handleTapWithHover(x, y);
			didTap = true;
		}

		this.touchMode = null;

		if (mode === "pan") {
			this.startInertia();
		}

		if (!didTap) {
			this.clearHover();
		}
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
		await this.handlePointClick(x, y, e.ctrlKey, e.metaKey);
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
			const r = d.dateRect;
			if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
				const today = this.getToday();
				const date = this.getDateForIndex(d.index, today);
				console.log(d.kind, date);
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
				console.log(d.kind, date);
				this.clearHover();
				return;
			}
		}
	}


	private async openEntry(entry: DateEntry, ev?: MouseEvent) {
		const app = this.plugin.app;
		const file = app.vault.getAbstractFileByPath(entry.file);
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

		const view = leaf.view as MarkdownView | null;
		if (!view) return;

		const line = Math.max(0, entry.blockStart ?? 0);
		view.editor.setCursor({ line, ch: 0 });
		// @ts-ignore
		view.editor.scrollIntoView(
			{ from: { line, ch: 0 }, to: { line, ch: 0 } },
			true
		);
	}

	private startInertia() {
		if (Math.abs(this.velocityY) < 0.01) return;
		this.lastFrameTime = null;
		this.requestHoverAnimation();
	}

	private clearHover() {
		if (this.hoverDateIndex == null && this.hoverSummary == null) return;
		this.hoverDateIndex = null;
		this.hoverSummary = null;
		this.canvas.style.cursor = "default";
		this.hoverTarget = 0;
		this.requestHoverAnimation();
	}

	private updateHover(x: number, y: number) {
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

	private getToday(): Date {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}

	private getDateForIndex(i: number, today: Date): Date {
		return new Date(today.getTime() - i * MS_PER_DAY);
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

	private getEntryTitle(entry: DateEntry): string {
		const file = this.plugin.app.vault.getAbstractFileByPath(entry.file);
		if (file instanceof TFile) {
			const name = file.name;
			return name.endsWith(".md") ? name.slice(0, -3) : name;
		}
		return entry.file;
	}

	private dist(a: Touch, b: Touch): number {
		const dx = a.clientX - b.clientX;
		const dy = a.clientY - b.clientY;
		return Math.hypot(dx, dy);
	}

	private mid(a: Touch, b: Touch): { x: number; y: number } {
		return {
			x: (a.clientX + b.clientX) / 2,
			y: (a.clientY + b.clientY) / 2
		};
	}

	private parseFontSize(font: string): { size: number; rest: string } {
		const m = font.match(/^\s*(\d+(?:\.\d+)?)px(.*)$/);
		if (!m) return { size: 12, rest: font };
		return { size: parseFloat(m[1]), rest: m[2] };
	}

	private mixFont(base: string, hover: string, t: number): string {
		const b = this.parseFontSize(base);
		const h = this.parseFontSize(hover);
		const size = b.size + (h.size - b.size) * t;
		return `${size.toFixed(2)}px${b.rest}`;
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

		const stillHover = Math.abs(target - this.hoverAnim) >= 0.01;
		const stillInertia = Math.abs(this.velocityY) >= 0.01;

		if (stillHover || stillInertia) {
			this.requestHoverAnimation();
		} else {
			this.lastFrameTime = null;
		}

		this.draw();
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
		const fontMainHover =
			css.getPropertyValue("--epoch-font-main-hover") || fontMain;
		const fontSmall = css.getPropertyValue("--epoch-font-small");
		const fontSmallHover =
			css.getPropertyValue("--epoch-font-small-hover") || fontSmall;
		const colSummaryHoverBg =
			css.getPropertyValue("--epoch-bg").trim() || "#ffffff";

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
			const allEntries = this.index[key] || [];
			const entries = allEntries.filter(
				e => e.summary && e.summary.trim().length > 0
			);

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

			const dateHoverT =
				this.animDateIndex === i ? this.hoverAnim : 0;

			const dateColor =
				dateHoverT > 0 ? colTextHover : colTextBase;
			const dateFont = this.mixFont(fontMain, fontMainHover, dateHoverT);

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

					const blockHeightRaw = bottom - top;
					const blockHeight = Math.max(
						SUMMARY_ROW_HEIGHT * 2,
						Math.abs(blockHeightRaw)
					);

					const maxRows = Math.max(
						1,
						Math.floor(blockHeight / SUMMARY_ROW_HEIGHT)
					);
					const itemsPerCol = Math.max(
						1,
						Math.min(maxRows, entries.length)
					);
					const cols = Math.ceil(entries.length / itemsPerCol);

					const hoverIdxForDay =
						this.animSummary && this.animSummary.dayIndex === i
							? this.animSummary.itemIndex
							: null;
					let hoverCol = -1;
					let hoverRow = -1;
					if (hoverIdxForDay != null) {
						hoverCol = Math.floor(hoverIdxForDay / itemsPerCol);
						hoverRow = hoverIdxForDay % itemsPerCol;
					}

					const rightWidth =
						w - (TIMELINE_X + SUMMARY_OFFSET_X) - SUMMARY_RIGHT_MARGIN;

					if (rightWidth > SUMMARY_MIN_WIDTH) {
						const colWidth = Math.min(SUMMARY_MAX_COL_WIDTH, rightWidth / cols);
						const xStart = TIMELINE_X + SUMMARY_OFFSET_X;
						const bandTop = midY - blockHeight / 2;

						ctx.textAlign = "left";

						for (let idx = 0; idx < entries.length; idx++) {
							const col = Math.floor(idx / itemsPerCol);
							const row = idx % itemsPerCol;

							const rowsThisCol = Math.min(
								itemsPerCol,
								entries.length - col * itemsPerCol
							);

							const hasHoverInCol =
								hoverIdxForDay != null && col === hoverCol;

							let extraBetween: number[] = [];
							let totalExtra = 0;

							if (hasHoverInCol && rowsThisCol > 1) {
								extraBetween = new Array(rowsThisCol - 1).fill(0);
								if (hoverRow > 0 && hoverRow < rowsThisCol) {
									extraBetween[hoverRow - 1] +=
										(HOVER_EXTRA_GAP / 2) * this.hoverAnim;
								}
								if (hoverRow < rowsThisCol - 1) {
									extraBetween[hoverRow] +=
										(HOVER_EXTRA_GAP / 2) * this.hoverAnim;
								}
								totalExtra = extraBetween.reduce((a, b) => a + b, 0);
							}

							const colHeight = rowsThisCol * SUMMARY_ROW_HEIGHT + totalExtra;
							const yStartCol = midY - colHeight / 2;

							let prefixExtra = 0;
							if (hasHoverInCol && rowsThisCol > 1) {
								for (let k = 0; k < row; k++) {
									prefixExtra += extraBetween[k] || 0;
								}
							}

							const x = xStart + col * colWidth;
							const yItemCenter =
								yStartCol +
								row * SUMMARY_ROW_HEIGHT +
								prefixExtra +
								SUMMARY_ROW_HEIGHT / 2;
							const yRectTop = yItemCenter - SUMMARY_ROW_HEIGHT / 2;
							const yRectBottom = yItemCenter + SUMMARY_ROW_HEIGHT / 2;

							const maxWidth = colWidth - 4;

							const summaryHoverT =
								this.animSummary &&
								this.animSummary.dayIndex === i &&
								this.animSummary.itemIndex === idx
									? this.hoverAnim
									: 0;

							const summaryColor =
								summaryHoverT > 0 ? colTextHover : colTextBase;

							if (this.scale >= SUMMARY_MIN_SCALE) {
								const base = entries[idx].summary || "";

								ctx.save();
								ctx.font = fontSmall;
								const truncatedBase = this.truncate(base, maxWidth, ctx);
								ctx.restore();

								if (summaryHoverT > 0) {
									const title = this.getEntryTitle(entries[idx]);
									let text = truncatedBase;
									if (title) {
										text = `${truncatedBase} ✎ ${title}`;
									}

									const hoverFontStr = this.mixFont(
										fontSmall,
										fontSmallHover,
										summaryHoverT
									);

									ctx.save();
									ctx.font = hoverFontStr;
									const textWidth = ctx.measureText(text).width;
									ctx.restore();

									this.hoverOverlay = {
										x,
										yTop: yRectTop,
										yBottom: yRectBottom,
										yCenter: yItemCenter,
										width: textWidth + HOVER_BG_PAD * 2,
										text,
										font: hoverFontStr
									};
								} else {
									ctx.fillStyle = summaryColor;
									ctx.font = fontSmall;
									ctx.fillText(truncatedBase, x, yItemCenter);
								}
							} else {
								const summaryColorLine = summaryColor;
								ctx.strokeStyle = summaryColorLine;
								ctx.lineWidth = 1;
								const baseLen = Math.max(10, maxWidth * 0.3);
								const extra = (maxWidth - baseLen) *
									((idx + 1) / entries.length);
								const len = baseLen + extra;
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
								itemIndex: idx,
								entry: entries[idx]
							});
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
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		this.canvas.removeEventListener("wheel", this.handleWheel);
		this.canvas.removeEventListener("mousedown", this.handleMouseDown);
		window.removeEventListener("mousemove", this.handleMouseMoveWindow);
		window.removeEventListener("mouseup", this.handleMouseUpWindow);

		this.canvas.removeEventListener("mousemove", this.handleMouseMoveCanvas);
		this.canvas.removeEventListener("mouseleave", this.handleMouseLeaveCanvas);

		this.canvas.removeEventListener("touchstart", this.handleTouchStart);
		this.canvas.removeEventListener("touchmove", this.handleTouchMove);
		this.canvas.removeEventListener("touchend", this.handleTouchEnd);
		this.canvas.removeEventListener("touchcancel", this.handleTouchCancel);

		this.canvas.removeEventListener("click", this.handleClick);

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
