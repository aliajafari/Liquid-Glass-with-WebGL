import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  type RefObject
} from "react";
import { blurToPx, radiusToPx, type LiquidGlassEffect } from "../core/config";
import {
  createLiquidGlassEngine,
  GLASS_ATTRIBUTE,
  type CaptureFunction,
  type LiquidGlassEngine,
  type LiquidGlassMode,
  type LiquidGlassPerformance,
  type LiquidGlassStats
} from "../core/engine";
import { useLiquidGlassContext } from "./context";

/** Where to capture the background from. */
export type ContainerTarget = RefObject<HTMLElement | null> | HTMLElement | string | null | undefined;

export interface LiquidGlassOptions extends LiquidGlassEffect, LiquidGlassPerformance {
  /**
   * Element to capture as the background. Defaults to the nearest
   * `<LiquidGlassContainer>`, otherwise the whole page (`document.body`), so the glass
   * can sit anywhere: in normal layout, `position: sticky` or `position: fixed`.
   */
  container?: ContainerTarget;
  /** Custom capture function, e.g. one built on `html2canvas-pro`. */
  capture?: CaptureFunction;
  /** Re-capture automatically when the DOM behind the glass changes. Default false. */
  autoRefresh?: boolean;
  /** Set to true to skip WebGL and always use the CSS fallback. */
  disabled?: boolean;
  onModeChange?: (mode: LiquidGlassMode, reason?: string) => void;
  onStats?: (stats: LiquidGlassStats) => void;
}

export interface LiquidGlassHandle {
  /** The glass element. */
  element: HTMLElement | null;
  /** Re-captures the background (call after content behind the glass changes). */
  refresh(): Promise<void>;
}

export interface LiquidGlassProps extends LiquidGlassOptions, Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Element or component to render as the glass root. Default `"div"`. */
  as?: ElementType;
  /** Extra styles for the CSS fallback layer (shown before WebGL is ready or when it is unavailable). */
  fallbackStyle?: CSSProperties;
  fallbackClassName?: string;
  /** Class for the wrapper around `children`. */
  contentClassName?: string;
  contentStyle?: CSSProperties;
  children?: ReactNode;
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined;
}

const EFFECT_KEYS = [
  "radius",
  "blur",
  "distortion",
  "zoom",
  "chromaticAberration",
  "frost",
  "frostScale",
  "light",
  "edgeGlow",
  "edgeWidth",
  "tint",
  "alpha",
  "lightDirection"
] as const satisfies ReadonlyArray<keyof LiquidGlassEffect>;

function resolveContainer(target: ContainerTarget, fallback: HTMLElement | null): HTMLElement | null {
  if (typeof target === "string") return document.querySelector<HTMLElement>(target);
  if (target && "current" in target) return target.current;
  if (target) return target;
  return fallback;
}

export interface UseLiquidGlassResult {
  /** Attach to the glass element. */
  glassRef: (node: HTMLElement | null) => void;
  /** Attach to a `<canvas>` inside the glass element. */
  canvasRef: (node: HTMLCanvasElement | null) => void;
  mode: LiquidGlassMode;
  reason: string | undefined;
  refresh: () => Promise<void>;
  glass: HTMLElement | null;
}

/**
 * Low-level hook behind `<LiquidGlass>`, for building your own glass components.
 * Attach `glassRef` to the glass element and `canvasRef` to a canvas inside it.
 */
export function useLiquidGlass(options: LiquidGlassOptions = {}): UseLiquidGlassResult {
  const context = useLiquidGlassContext();
  const defaults = context?.defaults ?? {};

  const [glass, setGlass] = useState<HTMLElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<LiquidGlassMode>("pending");
  const [reason, setReason] = useState<string | undefined>(undefined);
  const engineRef = useRef<LiquidGlassEngine | null>(null);

  const effect: LiquidGlassEffect = {};
  for (const key of EFFECT_KEYS) {
    const value = options[key] ?? defaults[key];
    if (value !== undefined) (effect as Record<string, unknown>)[key] = value;
  }
  const maxDpr = options.maxDpr ?? defaults.maxDpr;
  const targetFps = options.targetFps ?? defaults.targetFps;
  const capture = options.capture ?? defaults.capture;
  const autoRefresh = options.autoRefresh ?? defaults.autoRefresh ?? false;

  // Latest values, read by the engine without re-creating it.
  const latest = useRef({ effect, maxDpr, targetFps, onModeChange: options.onModeChange, onStats: options.onStats });
  latest.current = { effect, maxDpr, targetFps, onModeChange: options.onModeChange, onStats: options.onStats };

  const containerTarget = options.container;
  const contextContainer = context?.container ?? null;
  const containerKey = typeof containerTarget === "string" ? containerTarget : containerTarget;

  useEffect(() => {
    if (!glass || !canvas) return;
    if (options.disabled) {
      setMode("fallback");
      setReason("Disabled");
      return;
    }

    const container = resolveContainer(containerTarget, contextContainer ?? document.body);
    if (!container) {
      setMode("fallback");
      setReason("Container not found");
      return;
    }

    setMode("pending");
    setReason(undefined);

    const engine = createLiquidGlassEngine({
      container,
      glass,
      canvas,
      capture,
      autoRefresh,
      effect: latest.current.effect,
      maxDpr: latest.current.maxDpr,
      targetFps: latest.current.targetFps,
      onModeChange: (nextMode, nextReason) => {
        setMode(nextMode);
        setReason(nextReason);
        latest.current.onModeChange?.(nextMode, nextReason);
      },
      onStats: (stats) => latest.current.onStats?.(stats)
    });
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glass, canvas, containerKey, contextContainer, capture, autoRefresh, options.disabled]);

  const effectKey = JSON.stringify(effect);
  useEffect(() => {
    engineRef.current?.setEffect(latest.current.effect);
  }, [effectKey]);

  useEffect(() => {
    engineRef.current?.setPerformance({ maxDpr, targetFps });
  }, [maxDpr, targetFps]);

  const refresh = useCallback(() => engineRef.current?.refresh() ?? Promise.resolve(), []);

  return { glassRef: setGlass, canvasRef: setCanvas, mode, reason, refresh, glass };
}

const layerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  borderRadius: "inherit",
  display: "block"
};

/**
 * A surface that refracts whatever is rendered behind it, using WebGL2 with an
 * automatic CSS (`backdrop-filter`) fallback. Children render on top as normal HTML.
 */
export const LiquidGlass = forwardRef<LiquidGlassHandle, LiquidGlassProps>(function LiquidGlass(props, ref) {
  const {
    as: Component = "div",
    container,
    capture,
    autoRefresh,
    disabled,
    maxDpr,
    targetFps,
    onModeChange,
    onStats,
    fallbackStyle,
    fallbackClassName,
    contentClassName,
    contentStyle,
    style,
    children,
    radius,
    blur,
    distortion,
    zoom,
    chromaticAberration,
    frost,
    frostScale,
    light,
    edgeGlow,
    edgeWidth,
    tint,
    alpha,
    lightDirection,
    ...rest
  } = props;

  const context = useLiquidGlassContext();
  const { glassRef, canvasRef, mode, refresh, glass } = useLiquidGlass({
    container,
    capture,
    autoRefresh,
    disabled,
    maxDpr,
    targetFps,
    onModeChange,
    onStats,
    radius,
    blur,
    distortion,
    zoom,
    chromaticAberration,
    frost,
    frostScale,
    light,
    edgeGlow,
    edgeWidth,
    tint,
    alpha,
    lightDirection
  });

  useImperativeHandle(ref, () => ({ element: glass, refresh }), [glass, refresh]);

  const resolvedRadius = radius ?? context?.defaults.radius;
  const resolvedBlur = blur ?? context?.defaults.blur;

  const rootStyle: CSSProperties = {
    borderRadius: radiusToPx(resolvedRadius),
    isolation: "isolate",
    // Makes the glass the containing block for its absolute layers without forcing `position`.
    contain: "layout",
    ...style
  };

  const showFallback = mode !== "webgl";
  const fallbackLayer: CSSProperties = {
    ...layerStyle,
    opacity: showFallback ? 1 : 0,
    transition: "opacity 200ms ease",
    background: "rgba(255, 255, 255, 0.14)",
    boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.28), inset 0 1px 12px rgba(255, 255, 255, 0.18)",
    backdropFilter: `blur(${blurToPx(resolvedBlur)}px) saturate(160%)`,
    WebkitBackdropFilter: `blur(${blurToPx(resolvedBlur)}px) saturate(160%)`,
    ...fallbackStyle
  };

  return (
    <Component
      ref={glassRef}
      {...{ [GLASS_ATTRIBUTE]: "" }}
      data-liquid-glass-mode={mode}
      style={rootStyle}
      {...rest}
    >
      <span aria-hidden="true" className={fallbackClassName} style={fallbackLayer} />
      <canvas aria-hidden="true" ref={canvasRef} style={layerStyle} />
      <span className={contentClassName} style={{ position: "relative", display: "block", ...contentStyle }}>
        {children}
      </span>
    </Component>
  );
});
