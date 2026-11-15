import { createEffectConfig, map, radiusToPx } from "../src/core/config";

describe("createEffectConfig", () => {
  it("maps defaults to the original shader values", () => {
    const c = createEffectConfig();
    expect(c.borderRadius).toBeCloseTo(36);
    expect(c.blurRadius).toBeCloseTo(9);
    expect(c.zoom).toBeCloseTo(1.1575);
    expect(c.lightDirectionX).toBe(-0.7);
    expect(c.lightDirectionY).toBe(-1);
  });

  it("clamps out-of-range values", () => {
    expect(map(150, 0, 10)).toBe(10);
    expect(map(-5, 0, 10)).toBe(0);
    expect(radiusToPx(100)).toBe(80);
  });

  it("accepts a custom light direction", () => {
    const c = createEffectConfig({ lightDirection: [1, 0.5] });
    expect([c.lightDirectionX, c.lightDirectionY]).toEqual([1, 0.5]);
  });
});
