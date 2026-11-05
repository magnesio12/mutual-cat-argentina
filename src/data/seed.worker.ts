import { generateSeed } from "./seed";

self.onmessage = (ev: MessageEvent<{ seed: number }>) => {
  let last = 0;
  const state = generateSeed(ev.data.seed, (p) => {
    const now = Date.now();
    if (now - last > 60 || p.phase === "Listo") {
      last = now;
      (self as unknown as Worker).postMessage({ kind: "progress", progress: p });
    }
  });
  (self as unknown as Worker).postMessage({ kind: "done", state });
};
