import { createEffectConfig } from "./utils/config.js";
import { createPerformanceMonitor } from "./utils/performance.js";
import { captureElement, isCanvasSafe } from "./utils/dom-capture.js";

const vertexShaderSource = await fetch("../src/shaders/vertex.glsl").then((r) => r.text());
const fragmentShaderSource = await fetch("../src/shaders/fragment.glsl").then((r) => r.text());

export function createLiquidGlass(options) {
  const container = document.querySelector(options.container);
  const glass = document.querySelector(options.glass);
  const canvas = document.querySelector(options.canvas);
  const fallback = document.querySelector(options.fallback);

  const perfElements = {};
  for (const [key, selector] of Object.entries(options.performanceBox ?? {})) {
    perfElements[key] = document.querySelector(selector);
  }

  const monitor = createPerformanceMonitor(perfElements);

  const effectConfig = createEffectConfig(options.effect ?? {});
  const performanceConfig = {
    maxDpr: 1.25,
    targetFps: 30,
    animateGlass: false,
    ...(options.performance ?? {})
  };

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false
  });

  let useFallback = !gl;
  let dpr = Math.min(window.devicePixelRatio || 1, performanceConfig.maxDpr);

  function enableFallback(reason) {
    useFallback = true;
    canvas.style.display = "none";
    fallback.style.display = "block";
    monitor.setMode(reason);
  }

  if (!container || !glass || !canvas || !fallback) {
    throw new Error("Liquid Glass: required elements are missing.");
  }

  if (!gl || typeof html2canvas === "undefined") {
    enableFallback(!gl ? "CSS: No WebGL2" : "CSS: No html2canvas");
    return;
  }

  monitor.setMode("WebGL");

  function createShader(type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }

    return shader;
  }

  const program = gl.createProgram();

  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexShaderSource));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));

  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }

  gl.useProgram(program);

  const vertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1
  ]);

  const buffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "position");

  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    texture: gl.getUniformLocation(program, "u_texture"),
    borderRadius: gl.getUniformLocation(program, "u_borderRadius"),
    distortion: gl.getUniformLocation(program, "u_distortion"),
    zoom: gl.getUniformLocation(program, "u_zoom"),
    blurRadius: gl.getUniformLocation(program, "u_blurRadius"),
    chromaticAberration: gl.getUniformLocation(program, "u_chromaticAberration"),
    frostStrength: gl.getUniformLocation(program, "u_frostStrength"),
    frostScale: gl.getUniformLocation(program, "u_frostScale"),
    lightStrength: gl.getUniformLocation(program, "u_lightStrength"),
    lightDirection: gl.getUniformLocation(program, "u_lightDirection"),
    edgeGlow: gl.getUniformLocation(program, "u_edgeGlow"),
    edgeWidth: gl.getUniformLocation(program, "u_edgeWidth"),
    tint: gl.getUniformLocation(program, "u_tint"),
    alpha: gl.getUniformLocation(program, "u_alpha")
  };

  const texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const cropCanvas = document.createElement("canvas");
  const cropCtx = cropCanvas.getContext("2d");

  let snapshot = null;
  let isCapturing = false;

  let lastGlassLeft = null;
  let lastGlassTop = null;
  let lastGlassWidth = null;
  let lastGlassHeight = null;

  let lastUploadTime = 0;
  let lastSnapshotTime = 0;
  let lastRenderTime = 0;

  function syncCanvasSize() {
    dpr = Math.min(window.devicePixelRatio || 1, performanceConfig.maxDpr);

    const rect = glass.getBoundingClientRect();

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    cropCanvas.width = canvas.width;
    cropCanvas.height = canvas.height;

    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  async function captureContainer() {
    if (useFallback || isCapturing) return;

    isCapturing = true;
    const start = performance.now();

    try {
      snapshot = await captureElement(container, {
        dpr,
        ignoreElements: (el) => {
          return (
            el === glass ||
            el.id === "glass" ||
            el.id === "performanceBox"
          );
        }
      });

      lastSnapshotTime = performance.now() - start;
    } catch (error) {
      console.error(error);
      enableFallback("CSS: Capture Failed");
    } finally {
      isCapturing = false;
    }
  }

  function hasGlassPositionChanged() {
    const rect = glass.getBoundingClientRect();

    const changed =
      rect.left !== lastGlassLeft ||
      rect.top !== lastGlassTop ||
      rect.width !== lastGlassWidth ||
      rect.height !== lastGlassHeight;

    if (changed) {
      lastGlassLeft = rect.left;
      lastGlassTop = rect.top;
      lastGlassWidth = rect.width;
      lastGlassHeight = rect.height;
    }

    return changed;
  }

  function updateTexture() {
    if (useFallback || !snapshot) return;
    if (!hasGlassPositionChanged()) return;

    const uploadStart = performance.now();

    const containerRect = container.getBoundingClientRect();
    const glassRect = glass.getBoundingClientRect();

    const sx = (glassRect.left - containerRect.left) * dpr;
    const sy = (glassRect.top - containerRect.top) * dpr;
    const sw = glassRect.width * dpr;
    const sh = glassRect.height * dpr;

    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

    cropCtx.drawImage(
      snapshot,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );

    if (!isCanvasSafe(cropCtx)) {
      enableFallback("CSS: Tainted Image");
      return;
    }

    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        cropCanvas
      );
    } catch (error) {
      console.error(error);
      enableFallback("CSS: Texture Failed");
    }

    lastUploadTime = performance.now() - uploadStart;
  }

  function applyEffectConfig() {
    gl.uniform1f(uniforms.borderRadius, effectConfig.borderRadius * dpr);
    gl.uniform1f(uniforms.distortion, effectConfig.distortion);
    gl.uniform1f(uniforms.zoom, effectConfig.zoom);
    gl.uniform1f(uniforms.blurRadius, effectConfig.blurRadius * dpr);
    gl.uniform1f(uniforms.chromaticAberration, effectConfig.chromaticAberration * dpr);
    gl.uniform1f(uniforms.frostStrength, effectConfig.frostStrength);
    gl.uniform1f(uniforms.frostScale, effectConfig.frostScale * dpr);
    gl.uniform1f(uniforms.lightStrength, effectConfig.lightStrength);

    gl.uniform2f(
      uniforms.lightDirection,
      effectConfig.lightDirectionX,
      effectConfig.lightDirectionY
    );

    gl.uniform1f(uniforms.edgeGlow, effectConfig.edgeGlow);
    gl.uniform1f(uniforms.edgeWidth, effectConfig.edgeWidth);
    gl.uniform1f(uniforms.tint, effectConfig.tint);
    gl.uniform1f(uniforms.alpha, effectConfig.alpha);
  }

  function draw() {
    if (useFallback || !snapshot) return;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);

    applyEffectConfig();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.texture, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function render(now) {
    requestAnimationFrame(render);

    if (useFallback) return;

    const fpsInterval = 1000 / performanceConfig.targetFps;

    if (now - lastRenderTime < fpsInterval) return;

    const frameStart = performance.now();

    lastRenderTime = now;

    updateTexture();
    draw();

    monitor.update({
      frameTime: performance.now() - frameStart,
      snapshotTime: lastSnapshotTime,
      uploadTime: lastUploadTime,
      dpr,
      width: canvas.width,
      height: canvas.height
    });
  }

  async function start() {
    syncCanvasSize();
    await captureContainer();

    lastGlassLeft = null;
    updateTexture();

    requestAnimationFrame(render);
  }

  start();

  if (performanceConfig.animateGlass) {
    let t = 0;

    function animateBox() {
      t += 0.012;

      glass.style.left = `${32 + Math.sin(t) * 18}%`;
      glass.style.top = `${22 + Math.cos(t * 0.8) * 12}%`;

      requestAnimationFrame(animateBox);
    }

    animateBox();
  }

  window.addEventListener("resize", async () => {
    if (useFallback) return;

    syncCanvasSize();
    await captureContainer();
    lastGlassLeft = null;
  });

  const resizeObserver = new ResizeObserver(async () => {
    if (useFallback) return;

    syncCanvasSize();
    await captureContainer();
    lastGlassLeft = null;
  });

  resizeObserver.observe(glass);
  resizeObserver.observe(container);

  return {
    refresh: captureContainer,
    fallback: enableFallback
  };
}