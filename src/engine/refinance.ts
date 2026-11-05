import { pct, type Cents } from "./money";
import type { ISODate } from "./dates";
import { capitalPending, daysLate, isPaid, liquidatePenalty, unpaidInterest, unpaidPenalty, type Installment } from "./loan";
import { effectiveCategory } from "./provisions";

export interface RefinanceSimulation {
  capitalPending: Cents;
  unpaidInterest: Cents;
  penalties: Cents;
  condoned: Cents;
  penaltiesCharged: Cents;
  newPrincipal: Cents;
  category: number;
  days: number;
}

/**
 * Nuevo capital = capital pendiente total + intereses impagos de cuotas vencidas
 * + punitorios liquidados × (1 − condonación), parte cobrada redondeada half-up.
 */
export function simulateRefinance(
  installments: Installment[],
  tnaBps: number,
  date: ISODate,
  condonationBps: number,
  currentRefiCategory?: number,
  streak = 0,
): RefinanceSimulation {
  const qs = installments.map((q) => ({ ...q }));
  let interest = 0;
  let penalties = 0;
  for (const q of qs) {
    if (q.due > date) break;
    if (isPaid(q)) continue;
    liquidatePenalty(q, tnaBps, date);
    interest += unpaidInterest(q);
    penalties += unpaidPenalty(q);
  }
  const cap = capitalPending(qs);
  const charged = pct(penalties, 10000 - condonationBps);
  const days = daysLate(installments, date);
  return {
    capitalPending: cap,
    unpaidInterest: interest,
    penalties,
    condoned: penalties - charged,
    penaltiesCharged: charged,
    newPrincipal: cap + interest + charged,
    category: effectiveCategory(days, currentRefiCategory, streak),
    days,
  };
}
