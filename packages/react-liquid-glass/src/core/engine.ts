import { createEffectConfig, type LiquidGlassEffect, type ResolvedEffectConfig } from "./config";
import { fragmentShaderSource, vertexShaderSource } from "./shaders";
import { getSnapshotStore, GLASS_ATTRIBUTE, type CaptureFunction, type Snapshot } from "./snapshot";

export { GLASS_ATTRIBUTE, IGNORE_ATTRIBUTE } from "./snapshot";
export type { CaptureFunction, CaptureOptions } from "./snapshot";

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

function isCanvasSafe(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
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
  let resizeObserver: ResizeObserver | undefined;
  const store = getSnapshotStore(container);

  const cleanups: Array<() => void> = [];

  function stopLoop(): void {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    resizeObserver?.disconnect();
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
    refresh: () => captureContainer(true),
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

  // Marks the element so every capture hides it (see SnapshotStore.onclone).
  glass.setAttribute(GLASS_ATTRIBUTE, "");

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

  let snapshot: Snapshot | null = null;
  let hasTexture = false;
  let lastRect = "";
  let lastContainerSize = "";
  let needsResize = true;

  let uploadTime = 0;
  let lastRenderTime = 0;
  let frameCount = 0;
  let fpsTimer = performance.now();

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

  function captureContainer(queue = true): Promise<void> {
    if (destroyed || mode === "fallback") return Promise.resolve();
    return store.capture({ captureFn: options.capture, maxScale: dpr, queue });
  }

  function updateTexture(): void {
    if (!snapshot || !cropCtx) return;

    // Where the glass sits on the snapshot. Reading both rects every frame makes this
    // follow normal layout, sticky and fixed positioning, scrolling and animations.
    const glassRect = glass.getBoundingClientRect();
    const origin = store.origin();
    const x = glassRect.left - origin.left;
    const y = glassRect.top - origin.top;
    const key = `${x},${y},${glassRect.width},${glassRect.height},${canvas.width}`;
    if (key === lastRect) return;
    lastRect = key;
    if (glassRect.width === 0 || glassRect.height === 0) return;

    const start = performance.now();
    const s = snapshot.scale;

    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.drawImage(
      snapshot.canvas,
      x * s,
      y * s,
      glassRect.width * s,
      glassRect.height * s,
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
        snapshotTime: snapshot?.duration ?? 0,
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

  cleanups.push(
    store.subscribe({
      glass,
      onSnapshot(next) {
        snapshot = next;
        lastRect = "";
      },
      onError(error) {
        console.error(error);
        fail(error instanceof Error && /html2canvas/i.test(error.message) ? "html2canvas unavailable" : "Capture failed");
      }
    })
  );

  if (options.autoRefresh) cleanups.push(store.enableAutoRefresh());

  syncCanvasSize();
  needsResize = false;
  {
    const r = container.getBoundingClientRect();
    lastContainerSize = `${r.width}x${r.height}`;
  }
  // Reuse a snapshot another glass on the same container already has.
  if (!store.snapshot) void captureContainer(false);
  rafId = requestAnimationFrame(render);

  return api;
}
