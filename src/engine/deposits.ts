import { divHalfUp, type Cents } from "./money";
import { addDays, daysBetween, type ISODate } from "./dates";
import { MSG } from "./capacity";

export const TERMS = [30, 60, 90, 180] as const;
export type Term = (typeof TERMS)[number];

/** Interés simple = capital × TNA × días / 365, half-up. */
export function simpleInterest(capital: Cents, tnaBps: number, days: number): Cents {
  return Number(divHalfUp(BigInt(capital) * BigInt(tnaBps) * BigInt(days), 10000n * 365n));
}

export function maturityDate(start: ISODate, termDays: number): ISODate {
  return addDays(start, termDays);
}

export interface PrecancelResult {
  ok: boolean;
  message: string;
  days: number;
  interest: Cents;
  total: Cents;
}

/** Precancelación: no antes de 30 días; después, interés al 50 % de la tasa pactada por días transcurridos. */
export function precancel(capital: Cents, tnaBps: number, start: ISODate, date: ISODate): PrecancelResult {
  const days = daysBetween(start, date);
  if (days < 30) return { ok: false, message: MSG.precancel, days, interest: 0, total: capital };
  const interest = Number(divHalfUp(BigInt(capital) * BigInt(tnaBps) * BigInt(days), 2n * 10000n * 365n));
  return { ok: true, message: "Precancelación permitida", days, interest, total: capital + interest };
}
