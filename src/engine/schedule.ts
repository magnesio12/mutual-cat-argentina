import { divHalfUp, type Cents } from "./money";
import { addMonthsClamped, type ISODate } from "./dates";

export type AmortSystem = "frances" | "aleman";

export interface ScheduleRow {
  n: number;
  due: ISODate;
  capital: Cents;
  interest: Cents;
  total: Cents;
  balanceAfter: Cents;
}

/** Interés del período: saldo × (TNA/12), con TNA en bps; i = bps / 120000 sin redondear. */
export function monthlyInterest(balance: Cents, tnaBps: number): Cents {
  return Number(divHalfUp(BigInt(balance) * BigInt(tnaBps), 120000n));
}

/** Cuota francesa = P × i / (1 − (1 + i)^−n), calculada en racionales exactos y redondeada half-up. */
export function frenchInstallment(principal: Cents, tnaBps: number, n: number): Cents {
  if (tnaBps === 0) return Number(divHalfUp(BigInt(principal), BigInt(n)));
  const A = 120000n + BigInt(tnaBps);
  const B = 120000n;
  const An = A ** BigInt(n);
  const Bn = B ** BigInt(n);
  const num = BigInt(principal) * BigInt(tnaBps) * An;
  const den = 120000n * (An - Bn);
  return Number(divHalfUp(num, den));
}

export function frenchSchedule(principal: Cents, tnaBps: number, n: number, firstDue: ISODate): ScheduleRow[] {
  const cuota = frenchInstallment(principal, tnaBps, n);
  const rows: ScheduleRow[] = [];
  let bal = principal;
  for (let k = 1; k <= n; k++) {
    const interest = monthlyInterest(bal, tnaBps);
    const capital = k === n ? bal : cuota - interest;
    bal -= capital;
    rows.push({ n: k, due: addMonthsClamped(firstDue, k - 1), capital, interest, total: capital + interest, balanceAfter: bal });
  }
  return rows;
}

export function germanSchedule(principal: Cents, tnaBps: number, n: number, firstDue: ISODate): ScheduleRow[] {
  const cap = Number(divHalfUp(BigInt(principal), BigInt(n)));
  const rows: ScheduleRow[] = [];
  let bal = principal;
  for (let k = 1; k <= n; k++) {
    const interest = monthlyInterest(bal, tnaBps);
    const capital = k === n ? bal : cap;
    bal -= capital;
    rows.push({ n: k, due: addMonthsClamped(firstDue, k - 1), capital, interest, total: capital + interest, balanceAfter: bal });
  }
  return rows;
}

export function buildSchedule(system: AmortSystem, principal: Cents, tnaBps: number, n: number, firstDue: ISODate): ScheduleRow[] {
  return system === "frances"
    ? frenchSchedule(principal, tnaBps, n, firstDue)
    : germanSchedule(principal, tnaBps, n, firstDue);
}

export function scheduleTotals(rows: ScheduleRow[]) {
  let interest = 0;
  let capital = 0;
  for (const r of rows) {
    interest += r.interest;
    capital += r.capital;
  }
  return { interest, capital, total: interest + capital };
}
