import { divHalfUp, type Cents } from "./money";
import { daysBetween, type ISODate } from "./dates";
import type { ScheduleRow } from "./schedule";

export interface Installment {
  n: number;
  due: ISODate;
  capital: Cents;
  interest: Cents;
  paidCapital: Cents;
  paidInterest: Cents;
  /** Punitorio liquidado acumulado. */
  penalty: Cents;
  paidPenalty: Cents;
  /** Fecha hasta la que se liquidó punitorio (null = desde el vencimiento). */
  lastPenaltyDate: ISODate | null;
  /** Fecha en que quedó totalmente cancelada. */
  paidOffDate: ISODate | null;
}

export function installmentsFromSchedule(rows: ScheduleRow[]): Installment[] {
  return rows.map((r) => ({
    n: r.n,
    due: r.due,
    capital: r.capital,
    interest: r.interest,
    paidCapital: 0,
    paidInterest: 0,
    penalty: 0,
    paidPenalty: 0,
    lastPenaltyDate: null,
    paidOffDate: null,
  }));
}

export const unpaidCapital = (q: Installment) => q.capital - q.paidCapital;
export const unpaidInterest = (q: Installment) => q.interest - q.paidInterest;
export const unpaidPenalty = (q: Installment) => q.penalty - q.paidPenalty;
export const isPaid = (q: Installment) => unpaidCapital(q) === 0 && unpaidInterest(q) === 0 && unpaidPenalty(q) === 0;

/**
 * Punitorio = capital impago × (50 % TNA) × días / 365, redondeado half-up.
 */
export function penaltyAmount(capital: Cents, tnaBps: number, days: number): Cents {
  if (days <= 0 || capital <= 0) return 0;
  return Number(divHalfUp(BigInt(capital) * BigInt(tnaBps) * BigInt(days), 2n * 10000n * 365n));
}

export interface PenaltyLiquidation {
  days: number;
  amount: Cents;
}

/** Liquida el punitorio de una cuota hasta `date` (muta la copia recibida). */
export function liquidatePenalty(q: Installment, tnaBps: number, date: ISODate): PenaltyLiquidation {
  const from = q.lastPenaltyDate ?? q.due;
  const days = daysBetween(from, date);
  if (days <= 0) return { days: 0, amount: 0 };
  const amount = penaltyAmount(unpaidCapital(q), tnaBps, days);
  q.penalty += amount;
  q.lastPenaltyDate = date;
  return { days, amount };
}

export interface Allocation {
  n: number;
  due: ISODate;
  penaltyDays: number;
  penaltyLiquidated: Cents;
  penalty: Cents;
  interest: Cents;
  capital: Cents;
  remainingCapital: Cents;
  remainingInterest: Cents;
  settled: boolean;
}

export interface PaymentResult {
  installments: Installment[];
  allocations: Allocation[];
  applied: Cents;
  creditBefore: Cents;
  creditUsed: Cents;
  creditAfter: Cents;
}

const cloneInst = (qs: Installment[]) => qs.map((q) => ({ ...q }));

/**
 * Imputa un pago: cuotas con vencimiento ≤ fecha, de la más vieja a la más nueva;
 * en cada una punitorio, interés y capital. El sobrante queda como saldo a favor
 * (no adelanta capital). El saldo a favor previo se suma al pago.
 */
export function applyPayment(
  installments: Installment[],
  tnaBps: number,
  date: ISODate,
  amount: Cents,
  creditBefore: Cents = 0,
): PaymentResult {
  const qs = cloneInst(installments);
  let available = amount + creditBefore;
  const allocations: Allocation[] = [];
  for (const q of qs) {
    if (q.due > date) break;
    if (isPaid(q)) continue;
    if (available <= 0) break;
    const liq = liquidatePenalty(q, tnaBps, date);
    const pPen = Math.min(available, unpaidPenalty(q));
    q.paidPenalty += pPen;
    available -= pPen;
    const pInt = Math.min(available, unpaidInterest(q));
    q.paidInterest += pInt;
    available -= pInt;
    const pCap = Math.min(available, unpaidCapital(q));
    q.paidCapital += pCap;
    available -= pCap;
    const settled = isPaid(q);
    if (settled) q.paidOffDate = date;
    allocations.push({
      n: q.n,
      due: q.due,
      penaltyDays: liq.days,
      penaltyLiquidated: liq.amount,
      penalty: pPen,
      interest: pInt,
      capital: pCap,
      remainingCapital: unpaidCapital(q),
      remainingInterest: unpaidInterest(q),
      settled,
    });
  }
  const applied = amount + creditBefore - available;
  return {
    installments: qs,
    allocations,
    applied,
    creditBefore,
    creditUsed: Math.min(creditBefore, applied),
    creditAfter: available,
  };
}

/** Deuda exigible a una fecha (cuotas vencidas, con punitorio liquidado hipotéticamente). */
export function dueSummary(installments: Installment[], tnaBps: number, date: ISODate) {
  const qs = cloneInst(installments);
  let penalty = 0;
  let interest = 0;
  let capital = 0;
  for (const q of qs) {
    if (q.due > date) break;
    if (isPaid(q)) continue;
    liquidatePenalty(q, tnaBps, date);
    penalty += unpaidPenalty(q);
    interest += unpaidInterest(q);
    capital += unpaidCapital(q);
  }
  return { penalty, interest, capital, total: penalty + interest + capital };
}

export function capitalPending(installments: Installment[]): Cents {
  let s = 0;
  for (const q of installments) s += unpaidCapital(q);
  return s;
}

/** Días de atraso al corte = corte − vencimiento de la cuota impaga más vieja con vencimiento anterior al corte. */
export function daysLate(installments: Installment[], cutoff: ISODate): number {
  for (const q of installments) {
    if (q.due >= cutoff) return 0;
    if (unpaidCapital(q) > 0 || unpaidInterest(q) > 0) return daysBetween(q.due, cutoff);
  }
  return 0;
}

/**
 * Cuotas mensuales seguidas pagadas sin atraso (desde la refinanciación),
 * hasta la primera impaga. Una pagada con atraso reinicia el conteo.
 */
export function onTimeStreak(installments: Installment[], fromN = 1): number {
  let streak = 0;
  for (const q of installments) {
    if (q.n < fromN) continue;
    if (!q.paidOffDate) break;
    streak = q.paidOffDate <= q.due ? streak + 1 : 0;
  }
  return streak;
}

export type InstallmentStatus = "pagada" | "parcial" | "vencida" | "a vencer";
export function installmentStatus(q: Installment, today: ISODate): InstallmentStatus {
  if (unpaidCapital(q) === 0 && unpaidInterest(q) === 0) return "pagada";
  if (q.due < today) return "vencida";
  if (q.paidCapital > 0 || q.paidInterest > 0) return "parcial";
  return "a vencer";
}
