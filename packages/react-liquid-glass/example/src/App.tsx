import { useRef, useState, type PointerEvent } from "react";
import {
  DEFAULT_EFFECT,
  GlassButton,
  GlassCard,
  LiquidGlass,
  LiquidGlassContainer,
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
  ["edgeWidth", "Edge width"],
  ["tint", "Tint"]
];

export function App() {
  const [effect, setEffect] = useState<Required<Omit<LiquidGlassEffect, "lightDirection">>>({
    ...DEFAULT_EFFECT,
    blur: 15
  });
  const [pos, setPos] = useState({ x: 300, y: 150 });
  const [mode, setMode] = useState<LiquidGlassMode>("pending");
  const [reason, setReason] = useState<string>();
  const [stats, setStats] = useState<LiquidGlassStats>();
  const [count, setCount] = useState(0);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <main className="page">
      <header>
        <h1>React Liquid Glass</h1>
        <p>
          WebGL2 glass components for React. Drag the card, press the buttons, move the sliders.
        </p>
      </header>

      <LiquidGlassContainer className="stage" defaults={{ targetFps: 60 }}>
        <img className="bg" src="./background.jpg" alt="" />
        <div className="big-text">LIQUID GLASS</div>
        <div className="tiles">
          <div className="tile">React</div>
          <div className="tile">WebGL</div>
          <div className="tile">Shader</div>
        </div>

        <GlassCard
          className="drag-card"
          style={{ left: pos.x, top: pos.y }}
          {...effect}
          onModeChange={(m, r) => {
            setMode(m);
            setReason(r);
          }}
          onStats={setStats}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <h2>Glass Card</h2>
          <p>Real HTML inside a WebGL glass surface. Drag me around.</p>
          <GlassButton onClick={() => setCount((c) => c + 1)}>Clicked {count}×</GlassButton>
        </GlassCard>

        <nav className="dock">
          <GlassButton>Home</GlassButton>
          <GlassButton>Gallery</GlassButton>
          <GlassButton>About</GlassButton>
        </nav>

        <LiquidGlass className="orb" radius={100} blur={0} zoom={80} distortion={60} chromaticAberration={60} />
      </LiquidGlassContainer>

      <section className="panel">
        <div className="status">
          <strong>Mode:</strong> {mode}
          {reason ? ` (${reason})` : ""}
          {stats && (
            <span>
              {" "}
              · {stats.fps} fps · frame {stats.frameTime.toFixed(1)} ms · snapshot {stats.snapshotTime.toFixed(0)} ms
            </span>
          )}
        </div>
        <div className="sliders">
          {SLIDERS.map(([key, label]) => (
            <label key={key}>
              <span>
                {label} <output>{effect[key]}</output>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={effect[key]}
                onChange={(e) => setEffect((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        <pre className="code">{`<LiquidGlassContainer>
  <img src="/background.jpg" />
  <GlassCard ${SLIDERS.filter(([k]) => effect[k] !== DEFAULT_EFFECT[k])
    .map(([k]) => `${k}={${effect[k]}}`)
    .join(" ")}>
    Hello
  </GlassCard>
</LiquidGlassContainer>`}</pre>
      </section>
    </main>
  );
}
