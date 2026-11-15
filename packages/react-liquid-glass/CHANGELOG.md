# Changelog

## 0.2.0

- Glass follows its real position in the layout: normal flow, `position: sticky`, `position: fixed`, page scroll, resizes and animations.
- Without a `<LiquidGlassContainer>`, the backdrop is now the whole page (`document.body`) instead of the glass element's parent.
- Every glass on the same backdrop shares one capture, so a page with many glass elements captures the page once.
- Glass elements stay in the layout during capture (they're hidden rather than removed), so cards in normal flow no longer shift the content behind them.
- Elements that scroll inside the backdrop (`overflow: auto`) are re-captured after scrolling.
- Very tall pages are captured at a lower scale to stay under browser canvas limits.
- Custom `capture` functions receive `onclone`; forward it to html2canvas. `ignoreElements` is deprecated.

## 0.1.0

- First release: `LiquidGlass`, `LiquidGlassContainer`, `GlassCard`, `GlassButton`, `useLiquidGlass` and the framework-agnostic engine.
