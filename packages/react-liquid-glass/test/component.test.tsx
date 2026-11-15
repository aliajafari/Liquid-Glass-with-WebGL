import { render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { LiquidGlass, LiquidGlassContainer, type LiquidGlassHandle } from "../src";

describe("<LiquidGlass>", () => {
  it("falls back to CSS when WebGL2 is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const onModeChange = vi.fn();
    const ref = createRef<LiquidGlassHandle>();

    const { container } = render(
      <LiquidGlassContainer>
        <LiquidGlass ref={ref} onModeChange={onModeChange} className="glass">
          <p>content</p>
        </LiquidGlass>
      </LiquidGlassContainer>
    );

    await waitFor(() => expect(onModeChange).toHaveBeenCalledWith("fallback", "No WebGL2"));
    const glass = container.querySelector(".glass") as HTMLElement;
    expect(glass.dataset.liquidGlassMode).toBe("fallback");
    expect(ref.current?.element).toBe(glass);
    expect(container.querySelector("p")?.textContent).toBe("content");
    await expect(ref.current?.refresh()).resolves.toBeUndefined();
  });

  it("uses the CSS fallback when disabled", async () => {
    const { container } = render(<LiquidGlass disabled className="g" />);
    await waitFor(() =>
      expect((container.querySelector(".g") as HTMLElement).dataset.liquidGlassMode).toBe("fallback")
    );
  });
});
