import {
  capitalPending,
  computeCapacity,
  daysLate,
  onTimeStreak,
  provisionFor,
  topeFor,
  type ISODate,
  type ProvisionRow,
} from "@/engine";
import type { Loan, State } from "./types";

export const isActiveLoan = (l: Loan) => l.status === "vigente";

export function savingsTotal(s: State): number {
  let t = 0;
  for (const id in s.deposits) if (s.deposits[id].status === "vigente") t += s.deposits[id].capital;
  return t;
}

export function portfolioTotal(s: State): number {
  let t = 0;
  for (const id in s.loans) {
    const l = s.loans[id];
    if (isActiveLoan(l)) t += capitalPending(l.installments);
  }
  return t;
}

export function capacityOf(s: State) {
  return computeCapacity({ savings: savingsTotal(s), ownCapital: s.config.ownCapital, encajeBps: s.config.encajeBps, portfolio: portfolioTotal(s) });
}

export function topeOf(s: State) {
  return topeFor(capacityOf(s).capacity, s.config.topeBps);
}

export function associateLoans(s: State, associateId: string): Loan[] {
  return Object.values(s.loans).filter((l) => l.associateId === associateId);
}

export function associateBalance(s: State, associateId: string): number {
  let t = 0;
  for (const id in s.loans) {
    const l = s.loans[id];
    if (l.associateId === associateId && isActiveLoan(l)) t += capitalPending(l.installments);
  }
  return t;
}

export function loanProvision(s: State, l: Loan, cutoff: ISODate): ProvisionRow {
  const days = daysLate(l.installments, cutoff);
  return provisionFor(
    {
      id: l.id,
      type: l.type,
      capital: capitalPending(l.installments),
      days,
      refiCategory: l.refi?.category,
      streak: l.refi ? onTimeStreak(l.installments, l.refi.fromN) : 0,
    },
    s.config.provision,
  );
}

export function worstCategory(s: State, associateId: string, cutoff: ISODate): number {
  let w = 1;
  for (const l of associateLoans(s, associateId)) if (isActiveLoan(l)) w = Math.max(w, loanProvision(s, l, cutoff).category);
  return w;
}

export function dailyKey(branchId: string, date: ISODate) {
  return `${branchId}|${date}`;
}

export function dailyRemaining(s: State, branchId: string, date: ISODate): number {
  const quota = s.config.dailyQuota[branchId] ?? 0;
  return Math.max(0, quota - (s.dailyUsed[dailyKey(branchId, date)] ?? 0));
}

export function associateCredit(s: State, associateId: string): number {
  return associateLoans(s, associateId).reduce((t, l) => t + l.credit, 0);
}

export function todayISO(d = new Date()): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tsToISODate(ts: number): ISODate {
  return todayISO(new Date(ts));
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface NetworkCalc {
  capacity: ReturnType<typeof capacityOf>;
  tope: number;
  rows: (ProvisionRow & { code: string; branchId: string; associateId: string })[];
  total: number;
  byCategory: { category: number; count: number; capital: number; provision: number }[];
  byBranch: Record<string, { capital: number; provision: number; count: number; capacityUsed: number }>;
  ms: number;
}

/** Recálculo completo de la red (corre en el Web Worker). */
export function computeNetwork(s: State, cutoff: ISODate): NetworkCalc {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const capacity = capacityOf(s);
  const rows: NetworkCalc["rows"] = [];
  const byCategory = [1, 2, 3, 4, 5].map((category) => ({ category, count: 0, capital: 0, provision: 0 }));
  const byBranch: NetworkCalc["byBranch"] = {};
  for (const b of s.branches) byBranch[b.id] = { capital: 0, provision: 0, count: 0, capacityUsed: 0 };
  let total = 0;
  for (const id in s.loans) {
    const l = s.loans[id];
    if (!isActiveLoan(l)) continue;
    const r = loanProvision(s, l, cutoff);
    rows.push({ ...r, code: l.code, branchId: l.branchId, associateId: l.associateId });
    total += r.provision;
    const c = byCategory[r.category - 1];
    c.count++;
    c.capital += r.capital;
    c.provision += r.provision;
    const b = byBranch[l.branchId];
    if (b) {
      b.capital += r.capital;
      b.provision += r.provision;
      b.count++;
    }
  }
  const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return { capacity, tope: topeFor(capacity.capacity, s.config.topeBps), rows, total, byCategory, byBranch, ms };
}
