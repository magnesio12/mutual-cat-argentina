import { applyPayment, capitalPending, isPaid, precancel, simpleInterest, topeFor } from "@/engine";
import { associateBalance, capacityOf, dailyKey, isActiveLoan, tsToISODate } from "./selectors";
import type { AppEvent, Config, Loan, State } from "./types";

function deepMerge<T>(target: T, patch: any): T {
  const out: any = Array.isArray(target) ? [...(target as any)] : { ...(target as any) };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" ? deepMerge(out[k], v) : v;
  }
  return out;
}

/** Último préstamo vigente aprobado antes que `loan` (mismo asociado si existe). */
function partnerFor(s: State, loan: Loan): string | undefined {
  let best: Loan | undefined;
  for (const id in s.loans) {
    const l = s.loans[id];
    if (l.id === loan.id || !isActiveLoan(l) || l.approvedTs > loan.approvedTs) continue;
    const sameAssoc = l.associateId === loan.associateId;
    if (!best) best = l;
    else {
      const bestSame = best.associateId === loan.associateId;
      if ((sameAssoc && !bestSame) || (sameAssoc === bestSame && l.approvedTs > best.approvedTs)) best = l;
    }
  }
  return best?.id;
}

/**
 * Aplica un evento de dominio al estado (muta). Debe ser determinista:
 * se usa tanto en vivo como al reproducir la bitácora («estado al…»).
 */
export function applyEvent(s: State, e: AppEvent): void {
  const p = e.payload;
  switch (e.type) {
    case "APPROVE_LOAN": {
      const loan: Loan = structuredClone(p.loan);
      const cap = capacityOf(s).capacity;
      const tope = topeFor(cap, s.config.topeBps);
      const bal = associateBalance(s, loan.associateId);
      const exceeds = cap <= 0 || bal + loan.principal > tope || loan.principal > cap;
      if (exceeds) {
        loan.status = "observada";
        const partner = partnerFor(s, loan);
        loan.conflictWith = partner;
        const reason = bal + loan.principal > tope ? "Juntos superan el tope por asociado" : "Juntos superan la capacidad prestable";
        s.conflicts[`C-${loan.id}`] = {
          id: `C-${loan.id}`,
          keptLoanId: partner ?? "",
          observedLoanId: loan.id,
          reason,
          status: "pendiente",
          ts: e.ts,
        };
      } else {
        loan.status = "vigente";
        const k = dailyKey(loan.branchId, tsToISODate(e.ts));
        s.dailyUsed[k] = (s.dailyUsed[k] ?? 0) + loan.principal;
      }
      s.loans[loan.id] = loan;
      return;
    }
    case "REGISTER_PAYMENT": {
      const loan = s.loans[p.loanId];
      if (!loan) return;
      const r = applyPayment(loan.installments, loan.tnaBps, p.date, p.amount, loan.credit);
      loan.installments = r.installments;
      loan.credit = r.creditAfter;
      if (loan.installments.every(isPaid)) loan.status = "cancelado";
      s.payments[p.paymentId] = {
        id: p.paymentId,
        loanId: loan.id,
        date: p.date,
        amount: p.amount,
        creditUsed: r.creditUsed,
        creditAfter: r.creditAfter,
        ts: e.ts,
      };
      return;
    }
    case "CREATE_DEPOSIT": {
      s.deposits[p.deposit.id] = structuredClone(p.deposit);
      return;
    }
    case "PRECANCEL_DEPOSIT": {
      const d = s.deposits[p.depositId];
      if (!d || d.status !== "vigente") return;
      const r = precancel(d.capital, d.tnaBps, d.start, p.date);
      if (!r.ok) return;
      d.status = "precancelado";
      d.interestPaid = r.interest;
      d.closedOn = p.date;
      return;
    }
    case "MATURE_DEPOSIT": {
      const d = s.deposits[p.depositId];
      if (!d || d.status !== "vigente") return;
      d.status = "pagado";
      d.interestPaid = simpleInterest(d.capital, d.tnaBps, d.termDays);
      d.closedOn = p.date;
      if (p.renew && p.newDeposit) s.deposits[p.newDeposit.id] = structuredClone(p.newDeposit);
      return;
    }
    case "REFINANCE": {
      const old = s.loans[p.oldLoanId];
      if (!old) return;
      old.status = "refinanciado";
      const nl: Loan = structuredClone(p.newLoan);
      nl.status = "vigente";
      s.loans[nl.id] = nl;
      return;
    }
    case "RESOLVE_CONFLICT": {
      const c = s.conflicts[p.conflictId];
      if (!c) return;
      c.status = "resuelto";
      c.decision = p.decision;
      const keep = s.loans[p.keepLoanId];
      const drop = s.loans[p.dropLoanId];
      if (keep) keep.status = capitalPending(keep.installments) > 0 ? "vigente" : "cancelado";
      if (drop) drop.status = "anulado";
      return;
    }
    case "UPDATE_CONFIG": {
      s.config = deepMerge<Config>(s.config, p.patch);
      return;
    }
    default:
      return;
  }
}
