import { formatARS, pct, type Cents } from "./money";

export interface CapacityInput {
  savings: Cents;
  ownCapital: Cents;
  encajeBps: number;
  portfolio: Cents;
}

export interface CapacityBreakdown extends CapacityInput {
  encaje: Cents;
  capacity: Cents;
}

/** Capacidad = ahorros + capital propio − encaje (half-up) − cartera vigente. */
export function computeCapacity(i: CapacityInput): CapacityBreakdown {
  const encaje = pct(i.savings, i.encajeBps);
  return { ...i, encaje, capacity: i.savings + i.ownCapital - encaje - i.portfolio };
}

/** Tope por asociado = % de la capacidad, half-up (0 si la capacidad no es positiva). */
export function topeFor(capacity: Cents, topeBps: number): Cents {
  return capacity <= 0 ? 0 : pct(capacity, topeBps);
}

export type LoanType = "personal" | "prendario";

export interface LoanRequestCheck {
  type: LoanType;
  amount: Cents;
  associateBalance: Cents;
  capacity: Cents;
  topeBps: number;
  appraisal?: Cents;
  maxLtvBps?: number;
  /** Peor categoría de deuda vigente del asociado. */
  worstCategory?: number;
  dailyQuotaRemaining?: Cents;
}

export interface LoanDecision {
  ok: boolean;
  message: string;
  tope: Cents;
  available: Cents;
  code?: "mora" | "ltv" | "capacidad_negativa" | "tope" | "capacidad" | "cupo" | "monto";
}

export const MSG = {
  mora: "El asociado tiene deuda en mora: regularizá antes de otorgar",
  negative: "Capacidad prestable negativa: no se aprueban préstamos",
  ltv: (max: Cents) => `El monto supera el 70 % de la tasación: máximo ${formatARS(max)}`,
  tope: (max: Cents) => `Supera el tope por asociado: máximo disponible ${formatARS(max)}`,
  capacity: (max: Cents) => `Supera la capacidad prestable: máximo disponible ${formatARS(max)}`,
  quota: (max: Cents) => `Supera el cupo diario de la sucursal: disponible ${formatARS(max)}`,
  quotaZero: "Cupo diario de la sucursal agotado: no se aprueban préstamos hoy",
  approved: "Aprobado",
  precancel: "No se puede precancelar antes de los 30 días",
  undoCredit: "Primero deshacé el pago que usó este saldo a favor",
  noLater: "No hay eventos posteriores a esta fecha",
};

export function evaluateLoan(r: LoanRequestCheck): LoanDecision {
  const tope = topeFor(r.capacity, r.topeBps);
  const available = Math.max(0, Math.min(tope - r.associateBalance, r.capacity));
  const base = { tope, available };
  if (r.amount <= 0) return { ok: false, message: "Ingresá un monto mayor a cero", code: "monto", ...base };
  if ((r.worstCategory ?? 1) >= 3) return { ok: false, message: MSG.mora, code: "mora", ...base };
  if (r.type === "prendario" && r.appraisal !== undefined) {
    const max = pct(r.appraisal, r.maxLtvBps ?? 7000);
    if (r.amount > max) return { ok: false, message: MSG.ltv(max), code: "ltv", ...base };
  }
  if (r.capacity <= 0) return { ok: false, message: MSG.negative, code: "capacidad_negativa", ...base };
  if (r.associateBalance + r.amount > tope)
    return { ok: false, message: MSG.tope(Math.max(0, tope - r.associateBalance)), code: "tope", ...base };
  if (r.amount > r.capacity) return { ok: false, message: MSG.capacity(r.capacity), code: "capacidad", ...base };
  if (r.dailyQuotaRemaining !== undefined) {
    if (r.dailyQuotaRemaining <= 0) return { ok: false, message: MSG.quotaZero, code: "cupo", ...base };
    if (r.amount > r.dailyQuotaRemaining)
      return { ok: false, message: MSG.quota(r.dailyQuotaRemaining), code: "cupo", ...base };
  }
  return { ok: true, message: MSG.approved, ...base };
}

export interface QueueRequest {
  id: string;
  amount: Cents;
  associateBalance: Cents;
}

export interface QueueResult extends LoanDecision {
  id: string;
  capacityBefore: Cents;
  capacityAfter: Cents;
}

/** Evalúa solicitudes en orden de llegada; cada aprobación baja la capacidad y el tope siguiente. */
export function evaluateQueue(base: CapacityInput, topeBps: number, reqs: QueueRequest[]): QueueResult[] {
  let portfolio = base.portfolio;
  return reqs.map((r) => {
    const { capacity } = computeCapacity({ ...base, portfolio });
    const d = evaluateLoan({ type: "personal", amount: r.amount, associateBalance: r.associateBalance, capacity, topeBps });
    if (d.ok) portfolio += r.amount;
    const after = computeCapacity({ ...base, portfolio }).capacity;
    return { ...d, id: r.id, capacityBefore: capacity, capacityAfter: after };
  });
}
