/**
 * Effect parameters. Every value is a number from 0 to 100 (slider friendly)
 * and is mapped to the real shader uniform range internally.
 */
export interface LiquidGlassEffect {
  /** Corner radius of the glass shape. Default 45 (≈36px). */
  radius?: number;
  /** Gaussian blur strength of the background. Default 50. */
  blur?: number;
  /** Lens-style edge distortion. Default 30. */
  distortion?: number;
  /** Magnification of the content under the glass. Default 35. */
  zoom?: number;
  /** RGB separation at the edges. Default 20. */
  chromaticAberration?: number;
  /** Frost noise strength. Default 8. */
  frost?: number;
  /** Frost noise scale. Default 50. */
  frostScale?: number;
  /** Edge highlight / specular strength. Default 30. */
  light?: number;
  /** Rim glow intensity. Default 40. */
  edgeGlow?: number;
  /** Width of the glowing rim. Default 25. */
  edgeWidth?: number;
  /** Overall brightness (higher is brighter). Default 94. */
  tint?: number;
  /** Output opacity. Default 97. */
  alpha?: number;
  /** Direction the highlight comes from, as an `[x, y]` vector. Default `[-0.7, -1]`. */
  lightDirection?: readonly [number, number];
}

/** Resolved shader uniforms (in CSS pixels where applicable). */
export interface ResolvedEffectConfig {
  borderRadius: number;
  blurRadius: number;
  distortion: number;
  zoom: number;
  chromaticAberration: number;
  frostStrength: number;
  frostScale: number;
  lightStrength: number;
  lightDirectionX: number;
  lightDirectionY: number;
  edgeGlow: number;
  edgeWidth: number;
  tint: number;
  alpha: number;
}

export const DEFAULT_EFFECT: Readonly<Required<Omit<LiquidGlassEffect, "lightDirection">>> = {
  radius: 45,
  blur: 50,
  distortion: 30,
  zoom: 35,
  chromaticAberration: 20,
  frost: 8,
  frostScale: 50,
  light: 30,
  edgeGlow: 40,
  edgeWidth: 25,
  tint: 94,
  alpha: 97
};

export function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Maps a 0–100 value linearly onto `[outMin, outMax]`. */
export function map(value: number, outMin: number, outMax: number): number {
  return outMin + (outMax - outMin) * (clamp(value) / 100);
}

/** Corner radius in CSS pixels for a 0–100 `radius` value. */
export function radiusToPx(radius: number = DEFAULT_EFFECT.radius): number {
  return map(radius, 0, 80);
}

/** Blur in CSS pixels for a 0–100 `blur` value (used by the CSS fallback). */
export function blurToPx(blur: number = DEFAULT_EFFECT.blur): number {
  return map(blur, 0, 18);
}

export function createEffectConfig(ui: LiquidGlassEffect = {}): ResolvedEffectConfig {
  const d = DEFAULT_EFFECT;
  const [lx, ly] = ui.lightDirection ?? [-0.7, -1.0];

  return {
    borderRadius: radiusToPx(ui.radius ?? d.radius),
    blurRadius: blurToPx(ui.blur ?? d.blur),
    distortion: map(ui.distortion ?? d.distortion, 0, 0.38),
    zoom: map(ui.zoom ?? d.zoom, 1.0, 1.45),
    chromaticAberration: map(ui.chromaticAberration ?? d.chromaticAberration, 0, 5),
    frostStrength: map(ui.frost ?? d.frost, 0, 0.05),
    frostScale: map(ui.frostScale ?? d.frostScale, 40, 160),
    lightStrength: map(ui.light ?? d.light, 0, 0.35),
    lightDirectionX: lx,
    lightDirectionY: ly,
    edgeGlow: map(ui.edgeGlow ?? d.edgeGlow, 0, 0.8),
    edgeWidth: map(ui.edgeWidth ?? d.edgeWidth, 0.005, 0.045),
    tint: map(ui.tint ?? d.tint, 0.75, 1),
    alpha: map(ui.alpha ?? d.alpha, 0, 1)
  };
}
