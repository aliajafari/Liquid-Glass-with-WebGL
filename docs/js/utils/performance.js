export function createPerformanceMonitor(elements = {}) {
    let frameCount = 0;
    let fpsTimer = performance.now();
  
    return {
      update({ frameTime, snapshotTime, uploadTime, dpr, width, height }) {
        frameCount++;
  
        const now = performance.now();
  
        if (now - fpsTimer < 500) return;
  
        const fps = Math.round((frameCount * 1000) / (now - fpsTimer));
  
        if (elements.fps) elements.fps.textContent = fps;
        if (elements.frame) elements.frame.textContent = frameTime.toFixed(1);
        if (elements.snapshot) elements.snapshot.textContent = snapshotTime.toFixed(1);
        if (elements.upload) elements.upload.textContent = uploadTime.toFixed(1);
        if (elements.dpr) elements.dpr.textContent = dpr.toFixed(2);
        if (elements.resolution) elements.resolution.textContent = `${width}x${height}`;
  
        frameCount = 0;
        fpsTimer = now;
      },
  
      setMode(mode) {
        if (elements.mode) elements.mode.textContent = mode;
      }
    };
  }