/**
 * One shared background capture per container element. Every glass on the same
 * container reuses the same snapshot, so a page with ten glass elements captures
 * the page once, not ten times.
 */

export const GLASS_ATTRIBUTE = "data-liquid-glass";
export const IGNORE_ATTRIBUTE = "data-liquid-glass-ignore";

/** Safari refuses canvases above ~16.7M pixels; stay below it. */
const MAX_SNAPSHOT_PIXELS = 16_000_000;
const IMAGE_TIMEOUT_MS = 3000;
const SCROLL_RECAPTURE_DELAY_MS = 120;

export interface CaptureOptions {
  /** Pixel ratio to render the snapshot at. */
  scale: number;
  /**
   * Pass to html2canvas's `onclone`. It hides every glass element (and anything marked
   * `data-liquid-glass-ignore`) in the cloned document while keeping its space in the
   * layout, so glass in normal flow doesn't shift the content captured behind it.
   */
  onclone: (clonedDocument: Document) => void;
  /**
   * @deprecated Removing elements reflows the page. Use `onclone` instead. Kept for
   * capture functions written for 0.1; it now only skips html2canvas's own frames.
   */
  ignoreElements: (element: Element) => boolean;
}

export type CaptureFunction = (
  element: HTMLElement,
  options: CaptureOptions
) => Promise<HTMLCanvasElement>;

export interface Snapshot {
  canvas: HTMLCanvasElement;
  /** Snapshot pixels per CSS pixel. */
  scale: number;
  /** Time the capture took, in ms. */
  duration: number;
}

export interface SnapshotListener {
  glass: Element;
  onSnapshot(snapshot: Snapshot): void;
  onError(error: unknown): void;
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));

  return Promise.all(
    images.map((img) => {
      if (img.complete) return undefined;

      return new Promise<void>((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };
        const timer = setTimeout(done, IMAGE_TIMEOUT_MS);
        img.addEventListener("load", done);
        img.addEventListener("error", done);
      });
    })
  ).then(() => undefined);
}

function isTransparent(color: string): boolean {
  return !color || color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);
}

/** Canvas background for a whole-page capture, like the browser paints it. */
function pageBackground(): string {
  const html = getComputedStyle(document.documentElement).backgroundColor;
  if (!isTransparent(html)) return html;
  const body = getComputedStyle(document.body).backgroundColor;
  return isTransparent(body) ? "#ffffff" : body;
}

async function loadDefaultCapture(): Promise<CaptureFunction> {
  const mod = await import("html2canvas");
  const html2canvas = (mod as { default?: typeof mod.default }).default ?? (mod as unknown as typeof mod.default);

  return (element, { scale, onclone }) =>
    html2canvas(element, {
      backgroundColor: isPageElement(element) ? pageBackground() : null,
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      onclone
    });
}

function isPageElement(element: HTMLElement): boolean {
  return element === document.body || element === document.documentElement;
}

/** Size of what a capture of `element` covers, in CSS pixels (matches html2canvas). */
function captureSize(element: HTMLElement): { width: number; height: number } {
  if (isPageElement(element)) {
    const body = document.body;
    const html = document.documentElement;
    return {
      width: Math.max(body.scrollWidth, html.scrollWidth, body.offsetWidth, html.offsetWidth, body.clientWidth, html.clientWidth),
      height: Math.max(body.scrollHeight, html.scrollHeight, body.offsetHeight, html.offsetHeight, body.clientHeight, html.clientHeight)
    };
  }
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function isHtml2CanvasFrame(node: Node): boolean {
  return node.nodeName === "IFRAME" && (node as HTMLElement).classList.contains("html2canvas-container");
}

export class SnapshotStore {
  snapshot: Snapshot | null = null;
  private listeners = new Set<SnapshotListener>();
  private running: Promise<void> | null = null;
  private queued = false;
  private captureFn: CaptureFunction | undefined;
  private maxScale = 1;
  private scrollTimer: ReturnType<typeof setTimeout> | undefined;
  private mutationTimer: ReturnType<typeof setTimeout> | undefined;
  private mutationObserver: MutationObserver | undefined;
  private autoRefreshCount = 0;

  constructor(readonly container: HTMLElement) {}

  private readonly ignoreElements = (el: Element): boolean => isHtml2CanvasFrame(el);

  private readonly onclone = (clonedDocument: Document): void => {
    const style = clonedDocument.createElement("style");
    const hidden = `[${GLASS_ATTRIBUTE}]`;
    const ignored = `[${IGNORE_ATTRIBUTE}]`;
    style.textContent = `${hidden}, ${hidden} *, ${ignored}, ${ignored} * { visibility: hidden !important; }`;
    clonedDocument.head.appendChild(style);
  };

  private readonly onScroll = (event: Event): void => {
    const target = event.target;
    // Window scrolling needs no capture: the snapshot covers the whole page and is re-cropped.
    // An element that scrolls inside the container only renders its visible part, so re-capture.
    if (!(target instanceof Element) || target === document.documentElement || target === document.body) return;
    if (target !== this.container && !this.container.contains(target)) return;
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => void this.capture(), SCROLL_RECAPTURE_DELAY_MS);
  };

  /**
   * Viewport position of the snapshot's top-left corner. A page capture starts at the
   * document origin, so it moves with the window scroll; an element capture starts at
   * the element.
   */
  origin(): { left: number; top: number } {
    if (isPageElement(this.container)) return { left: -window.scrollX, top: -window.scrollY };
    const rect = this.container.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }

  subscribe(listener: SnapshotListener): () => void {
    if (this.listeners.size === 0) {
      document.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    }
    this.listeners.add(listener);
    if (this.snapshot) listener.onSnapshot(this.snapshot);

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        document.removeEventListener("scroll", this.onScroll, { capture: true });
        clearTimeout(this.scrollTimer);
      }
    };
  }

  /** Re-captures when the DOM inside the container changes, while at least one caller asks for it. */
  enableAutoRefresh(): () => void {
    this.autoRefreshCount++;
    if (!this.mutationObserver && typeof MutationObserver !== "undefined") {
      this.mutationObserver = new MutationObserver((records) => {
        const relevant = records.some((record) => {
          const target = record.target instanceof Element ? record.target : record.target.parentElement;
          if (target?.closest(`[${GLASS_ATTRIBUTE}],[${IGNORE_ATTRIBUTE}]`)) return false;
          if (record.type === "childList") {
            const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
            if (nodes.length > 0 && nodes.every(isHtml2CanvasFrame)) return false;
          }
          return true;
        });
        if (!relevant) return;
        clearTimeout(this.mutationTimer);
        this.mutationTimer = setTimeout(() => void this.capture(), 150);
      });
      this.mutationObserver.observe(this.container, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.autoRefreshCount--;
      if (this.autoRefreshCount === 0) {
        this.mutationObserver?.disconnect();
        this.mutationObserver = undefined;
        clearTimeout(this.mutationTimer);
      }
    };
  }

  /**
   * Captures the container. Concurrent requests share one capture; a request
   * made while a capture runs schedules exactly one more afterwards.
   */
  capture(options: { captureFn?: CaptureFunction; maxScale?: number; queue?: boolean } = {}): Promise<void> {
    if (options.captureFn) this.captureFn = options.captureFn;
    if (options.maxScale) this.maxScale = Math.max(this.maxScale, options.maxScale);

    if (this.running) {
      // `queue: false` is for first-time requests: any capture in flight is fresh enough.
      if (options.queue !== false) this.queued = true;
      return this.running;
    }

    this.running = (async () => {
      do {
        this.queued = false;
        if (this.listeners.size === 0) return;
        const start = performance.now();
        try {
          if (!this.captureFn) this.captureFn = await loadDefaultCapture();
          await waitForImages(this.container);

          const size = captureSize(this.container);
          const width = Math.max(1, size.width);
          const height = Math.max(1, size.height);
          const scale = Math.min(this.maxScale, Math.sqrt(MAX_SNAPSHOT_PIXELS / (width * height)));

          const canvas = await this.captureFn(this.container, {
            scale,
            onclone: this.onclone,
            ignoreElements: this.ignoreElements
          });
          const snapshot: Snapshot = {
            canvas,
            // html2canvas may round the size; derive the real scale from the result.
            scale: canvas.width / width || scale,
            duration: performance.now() - start
          };
          this.snapshot = snapshot;
          for (const listener of this.listeners) listener.onSnapshot(snapshot);
        } catch (error) {
          for (const listener of this.listeners) listener.onError(error);
          return;
        }
      } while (this.queued);
    })().finally(() => {
      this.running = null;
    });

    return this.running;
  }
}

const stores = new WeakMap<HTMLElement, SnapshotStore>();

export function getSnapshotStore(container: HTMLElement): SnapshotStore {
  let store = stores.get(container);
  if (!store) {
    store = new SnapshotStore(container);
    stores.set(container, store);
  }
  return store;
}
