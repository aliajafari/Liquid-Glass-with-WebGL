export async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
  
    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  }
  
  export async function captureElement(element, options = {}) {
    if (typeof html2canvas === "undefined") {
      throw new Error("html2canvas is not loaded.");
    }
  
    await waitForImages(element);
  
    return html2canvas(element, {
      backgroundColor: null,
      scale: options.dpr ?? 1,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 0,
      ignoreElements: options.ignoreElements
    });
  }
  
  export function isCanvasSafe(ctx) {
    try {
      ctx.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }