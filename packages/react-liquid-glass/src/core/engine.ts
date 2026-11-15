import { createEffectConfig, type LiquidGlassEffect, type ResolvedEffectConfig } from "./config";
import { fragmentShaderSource, vertexShaderSource } from "./shaders";

/** Attribute set on every glass element; such elements are never captured. */
export const GLASS_ATTRIBUTE = "data-liquid-glass";
/** Add this attribute to any element that should be left out of the background capture. */
export const IGNORE_ATTRIBUTE = "data-liquid-glass-ignore";

export interface CaptureOptions {
  /** Pixel ratio to render the snapshot at. */
  scale: number;
  /** Returns true for elements that must not appear in the snapshot. */
  ignoreElements: (element: Element) => boolean;
}

/**
 * Renders `element` to a canvas. Defaults to `html2canvas`; pass your own to use
 * a fork such as `html2canvas-pro` (needed for modern CSS colors like `oklch()`).
 */
export type CaptureFunction = (
  element: HTMLElement,
  options: CaptureOptions
) => Promise<HTMLCanvasElement>;

/** `pending` until the first WebGL frame is drawn, `fallback` when the CSS fallback is used. */
export type LiquidGlassMode = "pending" | "webgl" | "fallback";

export interface LiquidGlassStats {
  fps: number;
  /** Time spent rendering the last frame, in ms. */
  frameTime: number;
  /** Duration of the last background capture, in ms. */
  snapshotTime: number;
  /** Duration of the last texture upload, in ms. */
  uploadTime: number;
  dpr: number;
  width: number;
  height: number;
}

export interface LiquidGlassPerformance {
  /** Cap on `devicePixelRatio` for the canvas. Default 1.25. */
  maxDpr?: number;
  /** Maximum render rate. Default 30. */
  targetFps?: number;
}

export interface LiquidGlassEngineOptions extends LiquidGlassPerformance {
  /** Element whose rendering is captured as the background. */
  container: HTMLElement;
  /** The glass element. Its position and size define the cropped region. */
  glass: HTMLElement;
  /** Canvas inside `glass` used for WebGL output. */
  canvas: HTMLCanvasElement;
  effect?: LiquidGlassEffect;
  capture?: CaptureFunction;
  /** Re-capture automatically when the DOM inside `container` changes. Default false. */
  autoRefresh?: boolean;
  onModeChange?: (mode: LiquidGlassMode, reason?: string) => void;
  /** Called about twice per second with performance numbers. */
  onStats?: (stats: LiquidGlassStats) => void;
}

export interface LiquidGlassEngine {
  /** Re-captures the background. Call it when content behind the glass changes. */
  refresh(): Promise<void>;
  setEffect(effect: LiquidGlassEffect): void;
  setPerformance(performance: LiquidGlassPerformance): void;
  /** Switches to the CSS fallback permanently. */
  fallback(reason: string): void;
  getMode(): LiquidGlassMode;
  destroy(): void;
}

const IMAGE_TIMEOUT_MS = 3000;
const AUTO_REFRESH_DEBOUNCE_MS = 150;

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

async function loadDefaultCapture(): Promise<CaptureFunction> {
  const mod = await import("html2canvas");
  const html2canvas = (mod as { default?: typeof mod.default }).default ?? (mod as unknown as typeof mod.default);

  return (element, { scale, ignoreElements }) =>
    html2canvas(element, {
      backgroundColor: null,
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      ignoreElements
    });
}

function isCanvasSafe(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function isHtml2CanvasFrame(node: Node): boolean {
  return node.nodeName === "IFRAME" && (node as HTMLElement).classList.contains("html2canvas-container");
}

/**
 * Framework-agnostic liquid glass renderer. The React component is a thin
 * wrapper around this; use it directly for other frameworks.
 */
export function createLiquidGlassEngine(options: LiquidGlassEngineOptions): LiquidGlassEngine {
  const { container, glass, canvas } = options;

  let effect: ResolvedEffectConfig = createEffectConfig(options.effect);
  let maxDpr = options.maxDpr ?? 1.25;
  let targetFps = options.targetFps ?? 30;
  let mode: LiquidGlassMode = "pending";
  let destroyed = false;
  let dpr = 1;

  let rafId = 0;
  let autoRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;

  const cleanups: Array<() => void> = [];

  function stopLoop(): void {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    clearTimeout(autoRefreshTimer);
    for (const cleanup of cleanups.splice(0)) cleanup();
  }

  function setMode(next: LiquidGlassMode, reason?: string): void {
    if (destroyed || mode === next) return;
    mode = next;
    options.onModeChange?.(next, reason);
  }

  function fail(reason: string): void {
    if (destroyed || mode === "fallback") return;
    stopLoop();
    canvas.style.display = "none";
    setMode("fallback", reason);
  }

  const api: LiquidGlassEngine = {
    refresh: () => captureContainer(),
    setEffect(next) {
      effect = createEffectConfig(next);
      dirty = true;
    },
    setPerformance(next) {
      if (next.targetFps !== undefined) targetFps = next.targetFps;
      if (next.maxDpr !== undefined && next.maxDpr !== maxDpr) {
        maxDpr = next.maxDpr;
        handleDprChange();
      }
    },
    fallback: fail,
    getMode: () => mode,
    destroy() {
      if (destroyed) return;
      stopLoop();
      destroyed = true;
      if (gl) {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
    }
  };

  if (getComputedStyle(glass).position === "static") {
    glass.style.position = "relative";
  }

  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });

  // Declared up front so destroy() can always reference them.
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let dirty = true;

  if (!gl) {
    fail("No WebGL2");
    return api;
  }

  function compile(type: number, source: string): WebGLShader {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error("Liquid Glass: could not create shader.");
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const log = gl!.getShaderInfoLog(shader);
      gl!.deleteShader(shader);
      throw new Error(`Liquid Glass: shader compile failed. ${log ?? ""}`);
    }
    return shader;
  }

  let u: Record<string, WebGLUniformLocation | null>;

  try {
    program = gl.createProgram();
    if (!program) throw new Error("Liquid Glass: could not create program.");
    const vs = compile(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShaderSource);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Liquid Glass: program link failed. ${gl.getProgramInfoLog(program) ?? ""}`);
    }
  } catch (error) {
    console.error(error);
    fail("Shader error");
    return api;
  }

  gl.useProgram(program);

  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  u = {};
  for (const name of [
    "resolution",
    "texture",
    "borderRadius",
    "distortion",
    "zoom",
    "blurRadius",
    "chromaticAberration",
    "frostStrength",
    "frostScale",
    "lightStrength",
    "lightDirection",
    "edgeGlow",
    "edgeWidth",
    "tint",
    "alpha"
  ]) {
    u[name] = gl.getUniformLocation(program, `u_${name}`);
  }

  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const cropCanvas = document.createElement("canvas");
  const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });

  let captureFn: CaptureFunction | undefined = options.capture;
  let snapshot: HTMLCanvasElement | null = null;
  let hasTexture = false;
  let capturing: Promise<void> | null = null;
  let captureQueued = false;
  let lastRect = "";
  let lastContainerSize = "";
  let needsResize = true;

  let snapshotTime = 0;
  let uploadTime = 0;
  let lastRenderTime = 0;
  let frameCount = 0;
  let fpsTimer = performance.now();

  const ignoreElements = (el: Element): boolean =>
    el === glass || el.hasAttribute(GLASS_ATTRIBUTE) || el.hasAttribute(IGNORE_ATTRIBUTE);

  function currentDpr(): number {
    return Math.min(window.devicePixelRatio || 1, maxDpr);
  }

  function syncCanvasSize(): void {
    dpr = currentDpr();
    const rect = glass.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    cropCanvas.width = canvas.width;
    cropCanvas.height = canvas.height;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    lastRect = "";
    dirty = true;
  }

  function captureContainer(): Promise<void> {
    if (destroyed || mode === "fallback") return Promise.resolve();
    if (capturing) {
      captureQueued = true;
      return capturing;
    }

    capturing = (async () => {
      try {
        if (!captureFn) captureFn = await loadDefaultCapture();
      } catch (error) {
        console.error(error);
        fail("html2canvas unavailable");
        return;
      }

      do {
        captureQueued = false;
        const start = performance.now();
        try {
          await waitForImages(container);
          if (destroyed) return;
          const result = await captureFn(container, { scale: dpr, ignoreElements });
          if (destroyed) return;
          snapshot = result;
          snapshotTime = performance.now() - start;
          lastRect = "";
        } catch (error) {
          console.error(error);
          fail("Capture failed");
          return;
        }
      } while (captureQueued && !destroyed);
    })().finally(() => {
      capturing = null;
    });

    return capturing;
  }

  function updateTexture(): void {
    if (!snapshot || !cropCtx) return;

    const glassRect = glass.getBoundingClientRect();
    const key = `${glassRect.left},${glassRect.top},${glassRect.width},${glassRect.height}`;
    if (key === lastRect) return;
    lastRect = key;

    const start = performance.now();
    const containerRect = container.getBoundingClientRect();

    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.drawImage(
      snapshot,
      (glassRect.left - containerRect.left) * dpr,
      (glassRect.top - containerRect.top) * dpr,
      glassRect.width * dpr,
      glassRect.height * dpr,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );

    if (!isCanvasSafe(cropCtx)) {
      fail("Tainted image (CORS)");
      return;
    }

    try {
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, cropCanvas);
    } catch (error) {
      console.error(error);
      fail("Texture upload failed");
      return;
    }

    hasTexture = true;
    dirty = true;
    uploadTime = performance.now() - start;
  }

  function draw(): void {
    const g = gl!;
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    g.useProgram(program);

    g.uniform2f(u.resolution, canvas.width, canvas.height);
    // Clamp like CSS does, otherwise the SDF collapses into a diamond on small elements.
    g.uniform1f(u.borderRadius, Math.min(effect.borderRadius * dpr, Math.min(canvas.width, canvas.height) / 2));
    g.uniform1f(u.distortion, effect.distortion);
    g.uniform1f(u.zoom, effect.zoom);
    g.uniform1f(u.blurRadius, effect.blurRadius * dpr);
    g.uniform1f(u.chromaticAberration, effect.chromaticAberration * dpr);
    g.uniform1f(u.frostStrength, effect.frostStrength);
    g.uniform1f(u.frostScale, effect.frostScale * dpr);
    g.uniform1f(u.lightStrength, effect.lightStrength);
    g.uniform2f(u.lightDirection, effect.lightDirectionX, effect.lightDirectionY);
    g.uniform1f(u.edgeGlow, effect.edgeGlow);
    g.uniform1f(u.edgeWidth, effect.edgeWidth);
    g.uniform1f(u.tint, effect.tint);
    g.uniform1f(u.alpha, effect.alpha);

    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, texture);
    g.uniform1i(u.texture, 0);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  }

  function render(now: number): void {
    rafId = requestAnimationFrame(render);
    if (now - lastRenderTime < 1000 / targetFps) return;
    lastRenderTime = now;

    const frameStart = performance.now();

    if (needsResize) {
      needsResize = false;
      syncCanvasSize();
    }

    updateTexture();
    if (mode === "fallback") return;

    if (hasTexture && dirty) {
      dirty = false;
      draw();
      if (mode === "pending") {
        canvas.style.display = "";
        setMode("webgl");
      }
    }

    frameCount++;
    const elapsed = now - fpsTimer;
    if (options.onStats && elapsed >= 500) {
      options.onStats({
        fps: Math.round((frameCount * 1000) / elapsed),
        frameTime: performance.now() - frameStart,
        snapshotTime,
        uploadTime,
        dpr,
        width: canvas.width,
        height: canvas.height
      });
      frameCount = 0;
      fpsTimer = now;
    }
  }

  function handleDprChange(): void {
    if (destroyed || mode === "fallback") return;
    if (currentDpr() === dpr) return;
    needsResize = true;
    void captureContainer();
  }

  // Keep the canvas hidden until the first frame is drawn, so the CSS fallback shows meanwhile.
  canvas.style.display = "none";

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      needsResize = true;
      const r = container.getBoundingClientRect();
      const size = `${r.width}x${r.height}`;
      if (size !== lastContainerSize) {
        lastContainerSize = size;
        void captureContainer();
      }
    });
    resizeObserver.observe(glass);
    resizeObserver.observe(container);
  }

  const onWindowResize = (): void => handleDprChange();
  window.addEventListener("resize", onWindowResize);
  cleanups.push(() => window.removeEventListener("resize", onWindowResize));

  if (options.autoRefresh && typeof MutationObserver !== "undefined") {
    mutationObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target && (glass.contains(target) || target.closest(`[${GLASS_ATTRIBUTE}]`))) return false;
        if (record.type === "childList") {
          const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
          if (nodes.length > 0 && nodes.every(isHtml2CanvasFrame)) return false;
        }
        return true;
      });
      if (!relevant) return;
      clearTimeout(autoRefreshTimer);
      autoRefreshTimer = setTimeout(() => void captureContainer(), AUTO_REFRESH_DEBOUNCE_MS);
    });
    mutationObserver.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
  }

  syncCanvasSize();
  needsResize = false;
  {
    const r = container.getBoundingClientRect();
    lastContainerSize = `${r.width}x${r.height}`;
  }
  void captureContainer();
  rafId = requestAnimationFrame(render);

  return api;
}
