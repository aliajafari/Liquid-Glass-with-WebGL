// @vitest-environment node
import { renderToString } from "react-dom/server";
import { GlassButton, GlassCard, LiquidGlass, LiquidGlassContainer } from "../src";

describe("server rendering", () => {
  it("renders without touching browser globals", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(
      <LiquidGlassContainer defaults={{ blur: 20 }}>
        <LiquidGlass radius={50}>Hello</LiquidGlass>
        <GlassCard>Card</GlassCard>
        <GlassButton>Click</GlassButton>
      </LiquidGlassContainer>
    );
    expect(html).toContain("data-liquid-glass");
    expect(html).toContain('data-liquid-glass-mode="pending"');
    expect(html).toContain("<button");
    expect(html).toContain("Hello");
  });
});
