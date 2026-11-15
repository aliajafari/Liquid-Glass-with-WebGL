import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { LiquidGlass, type LiquidGlassHandle, type LiquidGlassProps } from "./LiquidGlass";

export type GlassCardProps = LiquidGlassProps;

/** A padded glass panel. */
export const GlassCard = forwardRef<LiquidGlassHandle, GlassCardProps>(function GlassCard(
  { style, radius = 40, ...props },
  ref
) {
  const cardStyle: CSSProperties = { padding: 24, color: "#fff", ...style };
  return <LiquidGlass ref={ref} radius={radius} style={cardStyle} {...props} />;
});

export type GlassButtonProps = Omit<LiquidGlassProps, "as"> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof LiquidGlassProps>;

/** A pill-shaped glass `<button>`. */
export const GlassButton = forwardRef<LiquidGlassHandle, GlassButtonProps>(function GlassButton(
  { style, contentStyle, radius = 100, blur = 25, zoom = 15, distortion = 20, type = "button", ...props },
  ref
) {
  const buttonStyle: CSSProperties = {
    display: "inline-block",
    padding: "12px 24px",
    border: "none",
    background: "transparent",
    color: "#fff",
    font: "inherit",
    fontWeight: 600,
    cursor: "pointer",
    ...style
  };
  return (
    <LiquidGlass
      ref={ref}
      as="button"
      radius={radius}
      blur={blur}
      zoom={zoom}
      distortion={distortion}
      style={buttonStyle}
      contentStyle={{ display: "inline-flex", alignItems: "center", gap: 8, ...contentStyle }}
      {...({ type, ...props } as LiquidGlassProps)}
    />
  );
});
