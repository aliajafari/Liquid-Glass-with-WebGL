export function clamp(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, value));
  }
  
  export function map(value, outMin, outMax) {
    return outMin + (outMax - outMin) * (clamp(value) / 100);
  }
  
  export function createEffectConfig(ui = {}) {
    return {
      borderRadius: map(ui.radius ?? 45, 0, 80),
      blurRadius: map(ui.blur ?? 50, 0, 18),
      distortion: map(ui.distortion ?? 30, 0, 0.38),
      zoom: map(ui.zoom ?? 35, 1.0, 1.45),
      chromaticAberration: map(ui.chromaticAberration ?? 20, 0, 5),
      frostStrength: map(ui.frost ?? 8, 0, 0.05),
      frostScale: map(ui.frostScale ?? 50, 40, 160),
      lightStrength: map(ui.light ?? 30, 0, 0.35),
      lightDirectionX: -0.7,
      lightDirectionY: -1.0,
      edgeGlow: map(ui.edgeGlow ?? 40, 0, 0.8),
      edgeWidth: map(ui.edgeWidth ?? 25, 0.005, 0.045),
      tint: map(ui.tint ?? 94, 0.75, 1),
      alpha: map(ui.alpha ?? 97, 0, 1)
    };
  }