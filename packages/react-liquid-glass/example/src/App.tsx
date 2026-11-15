import { useState } from "react";
import {
  DEFAULT_EFFECT,
  GlassButton,
  GlassCard,
  LiquidGlass,
  type LiquidGlassEffect,
  type LiquidGlassMode,
  type LiquidGlassStats
} from "react-webgl-liquid-glass";

type EffectKey = keyof typeof DEFAULT_EFFECT;

const SLIDERS: Array<[EffectKey, string]> = [
  ["radius", "Radius"],
  ["blur", "Blur"],
  ["distortion", "Distortion"],
  ["zoom", "Zoom"],
  ["chromaticAberration", "Chromatic aberration"],
  ["frost", "Frost"],
  ["light", "Light"],
  ["edgeGlow", "Edge glow"],
  ["tint", "Tint"]
];

const PLACEMENTS = [
  {
    title: "In normal layout",
    body: "Drop a GlassCard into any div, grid or flex row. It refracts whatever the page draws behind it.",
    code: `<div className="grid">\n  <GlassCard>…</GlassCard>\n</div>`
  },
  {
    title: "Sticky",
    body: "The navigation bar above is position: sticky. Scroll and watch the page slide under it.",
    code: `<LiquidGlass as="nav"\n  style={{ position: "sticky", top: 16 }} />`
  },
  {
    title: "Fixed",
    body: "The round button in the corner is position: fixed. It keeps refracting the page as you scroll.",
    code: `<GlassButton\n  style={{ position: "fixed", right: 24, bottom: 24 }} />`
  }
];

export function App() {
  const [effect, setEffect] = useState<Required<Omit<LiquidGlassEffect, "lightDirection">>>({
    ...DEFAULT_EFFECT,
    radius: 100,
    blur: 0,
    zoom: 70,
    distortion: 55,
    chromaticAberration: 45
  });
  const [mode, setMode] = useState<LiquidGlassMode>("pending");
  const [reason, setReason] = useState<string>();
  const [stats, setStats] = useState<LiquidGlassStats>();

  return (
    <>
      <LiquidGlass
        as="nav"
        className="nav"
        radius={100}
        blur={35}
        distortion={25}
        zoom={10}
        onModeChange={(m, r) => {
          setMode(m);
          setReason(r);
        }}
        onStats={setStats}
        contentClassName="nav-inner"
      >
        <strong className="brand">Liquid Glass</strong>
        <span className="nav-links">
          <a href="#anywhere">Placement</a>
          <a href="#playground">Playground</a>
          <a href="https://www.npmjs.com/package/react-webgl-liquid-glass">npm</a>
        </span>
        <span className="nav-status">
          {mode}
          {reason ? ` (${reason})` : ""}
          {stats ? ` · ${stats.fps} fps` : ""}
        </span>
      </LiquidGlass>

      <header className="hero">
        <img className="hero-bg" src="./background.jpg" alt="" />
        <div className="hero-word" aria-hidden="true">
          LIQUID GLASS
        </div>
        <GlassCard className="hero-card" blur={20}>
          <h1>Glass components for React</h1>
          <p>
            WebGL2 refraction, blur and chromatic edges on real HTML. Place them like any other
            element: no wrappers to position, no dragging.
          </p>
          <code className="install">npm i react-webgl-liquid-glass</code>
        </GlassCard>
      </header>

      <section id="anywhere" className="stripes">
        <h2>Put it anywhere</h2>
        <div className="grid">
          {PLACEMENTS.map((p) => (
            <GlassCard key={p.title} blur={30} className="tile">
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <pre>{p.code}</pre>
            </GlassCard>
          ))}
        </div>
      </section>

      <section id="playground" className="playground">
        <img className="hero-bg" src="./background.jpg" alt="" />
        <div className="playground-row">
          <LiquidGlass className="lens" {...effect} />
          <GlassCard className="controls" blur={40} tint={80}>
            <h2>Playground</h2>
            <div className="sliders">
              {SLIDERS.map(([key, label]) => (
                <label key={key} htmlFor={`slider-${key}`}>
                  <span>
                    {label} <output>{effect[key]}</output>
                  </span>
                  <input
                    id={`slider-${key}`}
                    type="range"
                    min={0}
                    max={100}
                    value={effect[key]}
                    onChange={(e) => setEffect((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
          </GlassCard>
        </div>
      </section>

      <footer className="footer">
        <p>MIT licensed. Effect props are 0–100, like sliders.</p>
      </footer>

      <GlassButton
        className="fab"
        aria-label="Back to top"
        radius={100}
        zoom={40}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        ↑
      </GlassButton>
    </>
  );
}
