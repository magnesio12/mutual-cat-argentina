import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppStore } from "./store";
import { SEED } from "./config";
import { computeNetwork, todayISO, type NetworkCalc } from "./selectors";
import type { State, User } from "./types";
import type { SeedProgress } from "./seed";

const Ctx = createContext<AppStore | null>(null);

function generateInWorker(onProgress: (p: SeedProgress) => void): Promise<State> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./seed.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev) => {
      if (ev.data.kind === "progress") onProgress(ev.data.progress);
      else if (ev.data.kind === "done") {
        resolve(ev.data.state);
        w.terminate();
      }
    };
    w.onerror = (e) => reject(e);
    w.postMessage({ seed: SEED });
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new AppStore());
  useEffect(() => {
    void store.init(generateInWorker);
    return () => store.dispose();
  }, [store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Devuelve el almacén y se re-renderiza en cada cambio. */
export function useStore(): AppStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useStore fuera de StoreProvider");
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store;
}

export function useCurrentUser(): [User, (id: string) => void] {
  const store = useStore();
  const users = store.state?.users ?? [];
  const [id, setId] = useState<string>("u2");
  useEffect(() => {
    const saved = sessionStorage.getItem("mc-user");
    if (saved) setId(saved);
  }, []);
  const user = users.find((u) => u.id === id) ?? users[1] ?? { id: "u2", name: "Martín Bustos", role: "cajero", branchId: "VT" };
  store.user = user;
  return [
    user,
    (nid: string) => {
      sessionStorage.setItem("mc-user", nid);
      setId(nid);
    },
  ];
}

/** Recálculo de capacidad y previsiones de toda la red en un Web Worker. */
export function useNetwork(state: State | null | undefined, cutoff: string, key: unknown): { data: NetworkCalc | null; busy: boolean } {
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const [data, setData] = useState<NetworkCalc | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const w = new Worker(new URL("./calc.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (ev) => {
      if (ev.data.id === reqId.current) {
        setData(ev.data.result);
        setBusy(false);
      }
    };
    return () => w.terminate();
  }, []);
  useEffect(() => {
    if (!state) return;
    const id = ++reqId.current;
    setBusy(true);
    const t = setTimeout(() => {
      if (workerRef.current) workerRef.current.postMessage({ id, state, cutoff });
      else {
        setData(computeNetwork(state, cutoff));
        setBusy(false);
      }
    }, 30);
    return () => clearTimeout(t);
  }, [state, cutoff, key]);
  return { data, busy };
}

export function useToday() {
  return useMemo(() => todayISO(), []);
}
