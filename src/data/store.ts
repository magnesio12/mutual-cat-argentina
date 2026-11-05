import { canUndoPayment, isMeta, sortEvents, stateAtNotice, undoneSet } from "@/engine";
import { applyEvent } from "./reducer";
import { clearAll, eventPut, eventsAll, kvDelete, kvGet, kvKeys, kvSet } from "./idb";
import type { SeedProgress } from "./seed";
import type { AppEvent, EventType, State, User } from "./types";

export const SNAPSHOT_EVERY = 500;
const CHANNEL = "mutual-cat-sync";

interface SnapMeta {
  ts: number;
  count: number;
}

export interface DispatchInput {
  type: EventType;
  entity: string;
  entityId: string;
  summary: string;
  payload: unknown;
  before?: unknown;
  after?: unknown;
}

export type Generator = (onProgress: (p: SeedProgress) => void) => Promise<State>;

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Almacén de la app: semilla en IndexedDB + bitácora inmutable de eventos.
 * El estado actual es la semilla (o la instantánea más cercana) más los eventos vigentes.
 */
export class AppStore {
  base!: State;
  state!: State;
  events: AppEvent[] = [];
  version = 0;
  status: "idle" | "loading" | "seeding" | "ready" = "idle";
  progress: SeedProgress | null = null;
  redoStack: string[] = [];
  user: User | null = null;
  lastRemoteAt = 0;
  private snaps: SnapMeta[] = [];
  private effCount = 0;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  async init(generate: Generator) {
    this.status = "loading";
    this.emit();
    let base = await kvGet<State>("base");
    if (!base) {
      this.status = "seeding";
      this.emit();
      base = await generate((p) => {
        this.progress = p;
        this.emit();
      });
      await kvSet("base", base);
    }
    this.base = base;
    this.events = sortEvents(await eventsAll<AppEvent>());
    const keys = (await kvKeys()).map(String).filter((k) => k.startsWith("snap:"));
    this.snaps = keys.map((k) => {
      const [, ts, count] = k.split(":");
      return { ts: Number(ts), count: Number(count) };
    });
    this.snaps.sort((a, b) => a.ts - b.ts);
    await this.rebuild();
    this.status = "ready";
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (ev) => void this.onRemote(ev.data);
    }
    this.emit();
  }

  dispose() {
    this.channel?.close();
  }

  private snapKey(s: SnapMeta) {
    return `snap:${s.ts}:${s.count}`;
  }

  private async loadFrom(until: number): Promise<{ state: State; snap: SnapMeta | null }> {
    const snap = [...this.snaps].reverse().find((s) => s.ts <= until) ?? null;
    if (snap) {
      const st = await kvGet<State>(this.snapKey(snap));
      if (st) return { state: st, snap };
    }
    return { state: structuredClone(this.base), snap: null };
  }

  /** Reconstruye el estado actual desde la instantánea más cercana. */
  async rebuild() {
    const { state, snap } = await this.loadFrom(Infinity);
    const undone = undoneSet(this.events);
    let count = snap?.count ?? 0;
    for (const e of this.events) {
      if (snap && e.ts <= snap.ts) continue;
      if (isMeta(e) || undone.has(e.id)) continue;
      applyEvent(state, e);
      count++;
    }
    this.state = state;
    this.effCount = count;
    this.emit();
  }

  /** Estado reproducido hasta un instante («estado al…»). */
  async stateAt(ts: number): Promise<{ state: State; notice: string | null; applied: number }> {
    const { state, snap } = await this.loadFrom(ts);
    const undone = undoneSet(this.events, ts);
    let applied = 0;
    for (const e of this.events) {
      if (e.ts > ts) break;
      if (snap && e.ts <= snap.ts) continue;
      if (isMeta(e) || undone.has(e.id)) continue;
      applyEvent(state, e);
      applied++;
    }
    return { state, notice: stateAtNotice(this.events, ts), applied };
  }

  private async invalidateFrom(ts: number) {
    const drop = this.snaps.filter((s) => s.ts >= ts);
    this.snaps = this.snaps.filter((s) => s.ts < ts);
    for (const s of drop) await kvDelete(this.snapKey(s));
  }

  private nextTs() {
    const last = this.events.length ? this.events[this.events.length - 1].ts : 0;
    return Math.max(Date.now(), last + 1);
  }

  private makeEvent(i: DispatchInput): AppEvent {
    const u = this.user;
    return {
      id: uid(),
      ts: this.nextTs(),
      userId: u?.id ?? "sistema",
      userName: u?.name ?? "Sistema",
      branchId: u?.branchId ?? "VT",
      type: i.type,
      entity: i.entity,
      entityId: i.entityId,
      summary: i.summary,
      before: i.before ?? null,
      after: i.after ?? null,
      payload: i.payload,
    };
  }

  private insert(e: AppEvent) {
    const last = this.events[this.events.length - 1];
    if (!last || e.ts > last.ts || (e.ts === last.ts && e.id > last.id)) {
      this.events.push(e);
      return true; // al final
    }
    this.events = sortEvents([...this.events, e]);
    return false;
  }

  /** Registra un evento de dominio, lo aplica, lo persiste y lo difunde. */
  async dispatch(i: DispatchInput): Promise<AppEvent> {
    const e = this.makeEvent(i);
    this.insert(e);
    if (!isMeta(e)) {
      applyEvent(this.state, e);
      this.effCount++;
      this.redoStack = [];
    }
    await eventPut(e);
    this.channel?.postMessage({ kind: "event", event: e });
    if (!isMeta(e) && this.effCount % SNAPSHOT_EVERY === 0) {
      const s = { ts: e.ts, count: this.effCount };
      await kvSet(this.snapKey(s), structuredClone(this.state));
      this.snaps.push(s);
    }
    this.emit();
    return e;
  }

  private async onRemote(msg: { kind: string; event?: AppEvent }) {
    if (msg.kind === "reset") {
      if (typeof location !== "undefined") location.reload();
      return;
    }
    if (msg.kind !== "event" || !msg.event) return;
    const e = msg.event;
    if (this.events.some((x) => x.id === e.id)) return;
    this.lastRemoteAt = Date.now();
    const atEnd = this.insert(e);
    if (atEnd && !isMeta(e)) {
      applyEvent(this.state, e);
      this.effCount++;
      this.emit();
    } else {
      const target = isMeta(e) ? this.events.find((x) => x.id === (e.payload as { targetId: string }).targetId) : e;
      await this.invalidateFrom(target?.ts ?? e.ts);
      await this.rebuild();
    }
  }

  /** Último evento de dominio vigente (para «Deshacer»). */
  lastUndoable(): AppEvent | undefined {
    const undone = undoneSet(this.events);
    for (let k = this.events.length - 1; k >= 0; k--) {
      const e = this.events[k];
      if (!isMeta(e) && !undone.has(e.id)) return e;
    }
    return undefined;
  }

  isUndone(id: string) {
    return undoneSet(this.events).has(id);
  }

  canUndo(target: AppEvent): { ok: boolean; message?: string } {
    if (this.isUndone(target.id)) return { ok: false, message: "Este evento ya está deshecho" };
    const s = this.state;
    if (target.type === "REGISTER_PAYMENT") {
      const pay = s.payments[target.payload.paymentId];
      if (!pay) return { ok: true };
      return canUndoPayment(pay, Object.values(s.payments).filter((p) => p.loanId === pay.loanId));
    }
    if (target.type === "APPROVE_LOAN" || target.type === "REFINANCE") {
      const loanId = target.type === "APPROVE_LOAN" ? target.payload.loan.id : target.payload.newLoan.id;
      if (Object.values(s.payments).some((p) => p.loanId === loanId))
        return { ok: false, message: "Primero deshacé los pagos de este préstamo" };
    }
    return { ok: true };
  }

  async undoEvent(target: AppEvent): Promise<{ ok: boolean; message?: string }> {
    const chk = this.canUndo(target);
    if (!chk.ok) return chk;
    await this.dispatch({
      type: "UNDO",
      entity: target.entity,
      entityId: target.entityId,
      summary: `Deshace: ${target.summary}`,
      payload: { targetId: target.id },
    });
    this.redoStack.push(target.id);
    await this.invalidateFrom(target.ts);
    await this.rebuild();
    return { ok: true };
  }

  async undo() {
    const t = this.lastUndoable();
    if (!t) return { ok: false, message: "No hay nada para deshacer" };
    return this.undoEvent(t);
  }

  async redo() {
    const id = this.redoStack.pop();
    if (!id) return { ok: false, message: "No hay nada para rehacer" };
    const target = this.events.find((e) => e.id === id);
    if (!target) return { ok: false, message: "Evento no encontrado" };
    const stack = this.redoStack;
    await this.dispatch({
      type: "REDO",
      entity: target.entity,
      entityId: target.entityId,
      summary: `Rehace: ${target.summary}`,
      payload: { targetId: id },
    });
    this.redoStack = stack;
    await this.invalidateFrom(target.ts);
    await this.rebuild();
    return { ok: true };
  }

  async reset() {
    await clearAll();
    this.channel?.postMessage({ kind: "reset" });
  }

  get snapshotCount() {
    return this.snaps.length;
  }
}
