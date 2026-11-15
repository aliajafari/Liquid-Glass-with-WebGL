import { createContext, useContext, useState, forwardRef, useCallback, type CSSProperties, type HTMLAttributes, type ReactNode, type ForwardedRef } from "react";
import type { LiquidGlassEffect } from "../core/config";
import type { CaptureFunction, LiquidGlassPerformance } from "../core/engine";

export interface LiquidGlassDefaults extends LiquidGlassEffect, LiquidGlassPerformance {
  capture?: CaptureFunction;
  autoRefresh?: boolean;
}

interface ContextValue {
  container: HTMLElement | null;
  defaults: LiquidGlassDefaults;
}

const LiquidGlassContext = createContext<ContextValue | null>(null);

export function useLiquidGlassContext(): ContextValue | null {
  return useContext(LiquidGlassContext);
}

export interface LiquidGlassContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Default effect and performance settings for every glass inside. */
  defaults?: LiquidGlassDefaults;
  children?: ReactNode;
}

function assignRef<T>(ref: ForwardedRef<T>, value: T): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * The backdrop that glass surfaces inside it refract. Everything rendered in
 * this element (except the glass itself) is captured as the background.
 */
export const LiquidGlassContainer = forwardRef<HTMLDivElement, LiquidGlassContainerProps>(
  function LiquidGlassContainer({ defaults, style, children, ...rest }, ref) {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        setContainer(node);
        assignRef(ref, node);
      },
      [ref]
    );
    const mergedStyle: CSSProperties = { position: "relative", ...style };

    return (
      <LiquidGlassContext.Provider value={{ container, defaults: defaults ?? {} }}>
        <div ref={setRefs} style={mergedStyle} {...rest}>
          {children}
        </div>
      </LiquidGlassContext.Provider>
    );
  }
);
