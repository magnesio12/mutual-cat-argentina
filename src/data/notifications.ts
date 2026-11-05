import { addDays, formatARS, formatDate, isPaid } from "@/engine";
import type { AppEvent, State } from "./types";

/** Aviso simulado: nunca se envía; solo se muestra en «Enviados (simulado)». */
export interface SimMessage {
  id: string;
  channel: "Correo" | "WhatsApp";
  kind: "Comprobante" | "Aprobación" | "Vencimiento" | "Mora" | "Depósito";
  to: string;
  subject: string;
  body: string;
  when: string;
}

const contact = (s: State, associateId: string) => {
  const a = s.associates[associateId];
  return { name: a?.name ?? "Asociado", email: a ? `asociado${a.number}@ejemplo.com.ar` : "—", phone: a ? `+54 9 341 ${String(a.number).padStart(7, "0").slice(-7)}` : "—" };
};

/** Comprobantes y avisos derivados de la bitácora (eventos no deshechos). */
export function messagesFromEvents(s: State, events: AppEvent[]): SimMessage[] {
  const undone = new Set<string>();
  for (const e of events) {
    if (e.type === "UNDO") undone.add(e.payload.targetId);
    if (e.type === "REDO") undone.delete(e.payload.targetId);
  }
  const out: SimMessage[] = [];
  for (const e of events) {
    if (undone.has(e.id)) continue;
    const when = new Date(e.ts).toISOString();
    const p = e.payload;
    if (e.type === "REGISTER_PAYMENT") {
      const l = s.loans[p.loanId];
      if (!l) continue;
      const c = contact(s, l.associateId);
      out.push({ id: `${e.id}-m`, channel: "Correo", kind: "Comprobante", to: c.email, when, subject: `Comprobante de pago ${p.paymentId}`, body: `${c.name}: registramos su pago de ${formatARS(p.amount)} del ${formatDate(p.date)} al préstamo ${l.code}.` });
    } else if (e.type === "APPROVE_LOAN" || e.type === "REFINANCE") {
      const l = e.type === "APPROVE_LOAN" ? p.loan : p.newLoan;
      if (!l) continue;
      const c = contact(s, l.associateId);
      out.push({ id: `${e.id}-w`, channel: "WhatsApp", kind: "Aprobación", to: c.phone, when, subject: e.type === "REFINANCE" ? "Refinanciación confirmada" : "Préstamo registrado", body: `${c.name}: su préstamo ${l.code} por ${formatARS(l.principal)} en ${l.n} cuotas quedó registrado.` });
    } else if (e.type === "CREATE_DEPOSIT" || e.type === "PRECANCEL_DEPOSIT" || e.type === "MATURE_DEPOSIT") {
      const d = e.type === "CREATE_DEPOSIT" ? p.deposit : s.deposits[p.depositId];
      if (!d) continue;
      const c = contact(s, d.associateId);
      const txt = e.type === "CREATE_DEPOSIT" ? `constituyó el depósito ${d.code} por ${formatARS(d.capital)}, vence el ${formatDate(d.maturity)}` : `se liquidó el depósito ${d.code}`;
      out.push({ id: `${e.id}-m`, channel: "Correo", kind: "Depósito", to: c.email, when, subject: `Constancia de depósito ${d.code}`, body: `${c.name}: ${txt}.` });
    }
  }
  return out.reverse();
}

/** Recordatorios de cuotas que vencen en los próximos `days` días y de cuotas vencidas impagas. */
export function reminders(s: State, today: string, days = 3): SimMessage[] {
  const limit = addDays(today, days);
  const out: SimMessage[] = [];
  for (const id in s.loans) {
    const l = s.loans[id];
    if (l.status !== "vigente") continue;
    const next = l.installments.find((i) => !isPaid(i));
    if (!next) continue;
    const c = contact(s, l.associateId);
    const due = next.capital + next.interest - next.paidCapital - next.paidInterest;
    if (next.due < today) {
      out.push({ id: `mora-${l.id}`, channel: "WhatsApp", kind: "Mora", to: c.phone, when: today, subject: `Cuota ${next.n} vencida`, body: `${c.name}: la cuota ${next.n} del préstamo ${l.code} venció el ${formatDate(next.due)}. Saldo ${formatARS(due)} más punitorios.` });
    } else if (next.due <= limit) {
      out.push({ id: `vto-${l.id}`, channel: "WhatsApp", kind: "Vencimiento", to: c.phone, when: today, subject: `Cuota ${next.n} por vencer`, body: `${c.name}: la cuota ${next.n} del préstamo ${l.code} vence el ${formatDate(next.due)} por ${formatARS(due)}.` });
    }
  }
  return out;
}
