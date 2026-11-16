import { useState, type ReactNode } from "react";
import { GlassButton, GlassCard, LiquidGlass } from "react-webgl-liquid-glass";

const REPO = "https://github.com/aliajafari/Liquid-Glass-with-WebGL";
const NPM = "https://www.npmjs.com/package/react-webgl-liquid-glass";
const INSTALL = "npm i react-webgl-liquid-glass";

const FEATURES = [
  {
    title: "Real refraction",
    body: "A WebGL2 shader bends, magnifies and splits the colors of whatever sits behind the glass. Watch the horizon line break as it passes through these cards."
  },
  {
    title: "Lays out like a div",
    body: "Use it in a grid, a flex row, or with sticky and fixed positioning. The menu above is sticky; these cards are a plain flex row."
  },
  {
    title: "Falls back gracefully",
    body: "Without WebGL2 the glass switches to a CSS backdrop blur. Your layout and content stay exactly the same."
  }
];

const STEPS: Array<{ title: string; text: ReactNode; code: string }> = [
  {
    title: "Install the package",
    text: "React 17 or newer. The only dependency is html2canvas, which captures the page behind the glass.",
    code: INSTALL
  },
  {
    title: "Drop in a glass component",
    text: (
      <>
        <code>GlassCard</code> is a padded panel and <code>GlassButton</code> is a pill-shaped button. Both render
        real elements, so children, events and refs work as usual.
      </>
    ),
    code: `import { GlassCard, GlassButton } from "react-webgl-liquid-glass";

export function Welcome() {
  return (
    <section className="hero">
      <GlassCard style={{ maxWidth: 420 }}>
        <h2>Hello, glass</h2>
        <p>Anything behind this card is refracted.</p>
      </GlassCard>
      <GlassButton onClick={start}>Get started</GlassButton>
    </section>
  );
}`
  },
  {
    title: "Tune the effect",
    text: (
      <>
        Every effect prop is a number from 0 to 100. Use <code>LiquidGlass</code> with <code>as</code> to make any
        element glass, like the sticky menu on this page.
      </>
    ),
    code: `import { LiquidGlass } from "react-webgl-liquid-glass";

<LiquidGlass
  as="nav"
  radius={100}
  blur={35}
  distortion={25}
  zoom={10}
  chromaticAberration={20}
  style={{ position: "sticky", top: 16 }}
>
  …
</LiquidGlass>`
  }
];

const PROPS = ["radius", "blur", "distortion", "zoom", "chromaticAberration", "frost", "light", "edgeGlow", "tint"];

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

function NpmIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path fill="#cb3837" d="M0 0h16v16H0z" />
      <path fill="#fff" d="M3 3h10v10h-2.5V5.5H8V13H3z" />
    </svg>
  );
}

function CopyInstall() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="install">
      <code>
        <span className="prompt" aria-hidden="true">$</span> {INSTALL}
      </code>
      <GlassButton
        className="copy"
        blur={30}
        zoom={20}
        onClick={() => {
          void navigator.clipboard?.writeText(INSTALL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </GlassButton>
    </div>
  );
}

export function App() {
  return (
    <>
      <LiquidGlass
        as="nav"
        className="nav"
        aria-label="Main"
        radius={100}
        blur={35}
        distortion={25}
        zoom={10}
        chromaticAberration={20}
        contentClassName="nav-inner"
      >
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true" />
          Liquid Glass
        </a>
        <span className="nav-links">
          <a href="#features">Features</a>
          <a href="#usage">Usage</a>
        </span>
        <span className="nav-icons">
          <a href={REPO} target="_blank" rel="noopener" aria-label="GitHub repository">
            <GitHubIcon />
          </a>
          <a href={NPM} target="_blank" rel="noopener" aria-label="npm package">
            <NpmIcon />
          </a>
        </span>
      </LiquidGlass>

      <header className="hero" id="top">

        <div className="hero-copy">
          <h1>Glass that bends the page behind it.</h1>
          <p>
            Liquid glass components for React. Refraction, blur and chromatic edges rendered with WebGL2, on top of
            real HTML.
          </p>
          <CopyInstall />
        </div>

        <div className="features" id="features">
          {FEATURES.map((f) => (
            <GlassCard key={f.title} className="feature" radius={45} blur={2} zoom={8} distortion={60} chromaticAberration={40}>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </GlassCard>
          ))}
        </div>
      </header>

      <main className="usage" id="usage">
        <div className="usage-head">
          <h2>How to use it</h2>
          <p>
            Three steps from install to a tuned glass menu. The full API is in the{" "}
            <a href={`${REPO}/tree/main/packages/react-liquid-glass#readme`}>package README</a>.
          </p>
        </div>

        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <div className="step-text">
                <span className="step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {i === 2 && (
                  <ul className="props" aria-label="Effect props">
                    {PROPS.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
              <pre className="code">
                <code>{s.code}</code>
              </pre>
            </li>
          ))}
        </ol>
      </main>

      <footer className="footer">
        <p>MIT licensed. Made by Ali A. Jafari.</p>
        <p className="footer-links">
          <a href={REPO}>GitHub</a>
          <a href={NPM}>npm</a>
          <a href="../">Vanilla JS demo</a>
        </p>
      </footer>
    </>
  );
}
