import { describe, expect, it } from "vitest";
import { generateSeed } from "./seed";
import { applyEvent } from "./reducer";
import { messagesFromEvents, reminders } from "./notifications";
import type { AppEvent, State } from "./types";

const seed = generateSeed();
let n = 0;
const ev = (type: AppEvent["type"], payload: any): AppEvent => ({ id: `t${++n}`, ts: Date.parse("2026-11-05T12:00:00Z") + n, userId: "u", userName: "u", branchId: "b", type, entity: "", entityId: "", summary: "", before: null, after: null, payload });

describe("Acciones de pantallas", () => {
  it("resolver conflicto mantiene uno y anula el otro", () => {
    const s: State = structuredClone(seed);
    const [a, b] = Object.values(s.loans).filter((l) => l.status === "vigente");
    b.status = "observada";
    s.conflicts.C1 = { id: "C1", keptLoanId: a.id, observedLoanId: b.id, reason: "x", status: "pendiente", ts: 0 };
    applyEvent(s, ev("RESOLVE_CONFLICT", { conflictId: "C1", keepLoanId: a.id, dropLoanId: b.id, decision: "ok" }));
    expect(s.conflicts.C1.status).toBe("resuelto");
    expect(s.loans[b.id].status).toBe("anulado");
  });
  it("guardar parámetros cambia solo lo editado", () => {
    const s: State = structuredClone(seed);
    applyEvent(s, ev("UPDATE_CONFIG", { patch: { personalTnaBps: 9000 } }));
    expect(s.config.personalTnaBps).toBe(9000);
    expect(s.config.prendarioTnaBps).toBe(seed.config.prendarioTnaBps);
  });
  it("pagar depósito vencido y precancelar cambian el estado", () => {
    const s: State = structuredClone(seed);
    const [d1, d2] = Object.values(s.deposits).filter((d) => d.status === "vigente");
    applyEvent(s, ev("MATURE_DEPOSIT", { depositId: d1.id, date: d1.maturity, renew: false }));
    expect(s.deposits[d1.id].status).toBe("pagado");
    applyEvent(s, ev("PRECANCEL_DEPOSIT", { depositId: d2.id, date: "2027-12-31" }));
    expect(["precancelado", "vigente"]).toContain(s.deposits[d2.id].status);
  });
});

describe("Avisos simulados", () => {
  it("un pago genera un comprobante y desaparece al deshacerlo", () => {
    const s: State = structuredClone(seed);
    const loan = Object.values(s.loans).find((l) => l.status === "vigente")!;
    const pay = ev("REGISTER_PAYMENT", { loanId: loan.id, paymentId: "PX", date: "2026-11-05", amount: 100_00 });
    applyEvent(s, pay);
    expect(messagesFromEvents(s, [pay]).map((m) => m.kind)).toEqual(["Comprobante"]);
    expect(messagesFromEvents(s, [pay, ev("UNDO", { targetId: pay.id })])).toHaveLength(0);
  });
  it("hay recordatorios de vencimiento y de mora", () => {
    const kinds = new Set(reminders(seed, "2026-11-05", 30).map((m) => m.kind));
    expect(kinds.has("Mora")).toBe(true);
  });
});
