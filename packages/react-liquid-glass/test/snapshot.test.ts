import { getSnapshotStore, GLASS_ATTRIBUTE, type CaptureFunction } from "../src/core/snapshot";

function fakeCanvas(width: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 10;
  return canvas;
}

describe("SnapshotStore", () => {
  it("shares one capture between every glass on the same container", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const captureFn = vi.fn<CaptureFunction>(async () => fakeCanvas(100));
    const store = getSnapshotStore(container);
    expect(getSnapshotStore(container)).toBe(store);

    const a = vi.fn();
    const b = vi.fn();
    const offA = store.subscribe({ glass: document.createElement("div"), onSnapshot: a, onError: vi.fn() });
    const offB = store.subscribe({ glass: document.createElement("div"), onSnapshot: b, onError: vi.fn() });

    await Promise.all([store.capture({ captureFn, queue: false }), store.capture({ captureFn, queue: false })]);
    expect(captureFn).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    // A refresh requested during a capture runs exactly one more capture afterwards.
    await Promise.all([store.capture({ captureFn }), store.capture({ captureFn }), store.capture({ captureFn })]);
    expect(captureFn).toHaveBeenCalledTimes(3);

    // A glass that subscribes later gets the existing snapshot right away.
    const c = vi.fn();
    const offC = store.subscribe({ glass: document.createElement("div"), onSnapshot: c, onError: vi.fn() });
    expect(c).toHaveBeenCalledTimes(1);

    offA();
    offB();
    offC();
  });

  it("hides glass in the cloned document instead of removing it", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let onclone: ((doc: Document) => void) | undefined;
    const captureFn: CaptureFunction = async (_el, options) => {
      onclone = options.onclone;
      return fakeCanvas(10);
    };
    const store = getSnapshotStore(container);
    const off = store.subscribe({ glass: container, onSnapshot: vi.fn(), onError: vi.fn() });
    await store.capture({ captureFn });

    const doc = document.implementation.createHTMLDocument("clone");
    onclone!(doc);
    const css = doc.head.querySelector("style")?.textContent ?? "";
    expect(css).toContain(`[${GLASS_ATTRIBUTE}]`);
    expect(css).toContain("visibility: hidden");
    off();
  });

  it("reports capture errors to every subscriber", async () => {
    const container = document.createElement("div");
    const store = getSnapshotStore(container);
    const onError = vi.fn();
    const off = store.subscribe({ glass: container, onSnapshot: vi.fn(), onError });
    await store.capture({ captureFn: async () => Promise.reject(new Error("boom")) });
    expect(onError).toHaveBeenCalledOnce();
    off();
  });
});
