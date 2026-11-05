import { MSG } from "./capacity";

/** Utilidades puras de la bitácora de eventos (deshacer / rehacer / estado al…). */
export interface BaseEvent {
  id: string;
  ts: number;
  type: string;
  payload?: unknown;
}

export const isMeta = (e: BaseEvent) => e.type === "UNDO" || e.type === "REDO";
const targetOf = (e: BaseEvent) => (e.payload as { targetId: string }).targetId;

export function sortEvents<E extends BaseEvent>(events: E[]): E[] {
  return [...events].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Conjunto de eventos deshechos considerando UNDO/REDO hasta `until` (inclusive). */
export function undoneSet(events: BaseEvent[], until = Infinity): Set<string> {
  const s = new Set<string>();
  for (const e of events) {
    if (e.ts > until) break;
    if (e.type === "UNDO") s.add(targetOf(e));
    else if (e.type === "REDO") s.delete(targetOf(e));
  }
  return s;
}

/** Eventos de dominio vigentes (no deshechos) hasta `until`, en orden. */
export function effectiveEvents<E extends BaseEvent>(events: E[], until = Infinity): E[] {
  const sorted = sortEvents(events);
  const undone = undoneSet(sorted, until);
  return sorted.filter((e) => e.ts <= until && !isMeta(e) && !undone.has(e.id));
}

/** Aviso para la vista «estado al…». */
export function stateAtNotice(events: BaseEvent[], at: number): string | null {
  const last = events.reduce((m, e) => Math.max(m, e.ts), 0);
  return at >= last ? MSG.noLater : null;
}

export interface PaymentLike {
  id: string;
  loanId: string;
  ts: number;
  creditAfter: number;
  creditUsed: number;
}

/** Un pago que generó saldo a favor no se deshace si un pago posterior del mismo préstamo usó ese saldo. */
export function canUndoPayment(target: PaymentLike, active: PaymentLike[]): { ok: boolean; message?: string } {
  if (target.creditAfter <= 0) return { ok: true };
  const blocked = active.some((p) => p.id !== target.id && p.loanId === target.loanId && p.ts > target.ts && p.creditUsed > 0);
  return blocked ? { ok: false, message: MSG.undoCredit } : { ok: true };
}
