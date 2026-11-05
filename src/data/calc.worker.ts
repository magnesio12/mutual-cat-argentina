import { computeNetwork } from "./selectors";
import type { State } from "./types";

self.onmessage = (ev: MessageEvent<{ id: number; state: State; cutoff: string }>) => {
  const { id, state, cutoff } = ev.data;
  const result = computeNetwork(state, cutoff);
  (self as unknown as Worker).postMessage({ id, result });
};
