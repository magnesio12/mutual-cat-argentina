import "fake-indexeddb/auto";
import { describe, expect, it, beforeAll } from "vitest";
import { generateSeed } from "./seed";
import { AppStore } from "./store";
import { capacityOf, computeNetwork, topeOf } from "./selectors";
import { buildSchedule, installmentsFromSchedule, toCents } from "@/engine";
import type { Loan, State } from "./types";

let seed: State;
beforeAll(() => {
  seed = generateSeed();
});

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

describe("Semilla", () => {
  it("es determinista y ronda los 35.000 registros", () => {
    const again = generateSeed();
    expect(hash(JSON.stringify(again))).toBe(hash(JSON.stringify(seed)));
    expect(seed.seedRecords).toBeGreaterThan(30_000);
    expect(seed.seedRecords).toBeLessThan(42_000);
    expect(capacityOf(seed).capacity).toBeGreaterThan(0);
  });
  it("incluye los préstamos de los casos de prueba", () => {
    const c1 = seed.loans.LC1;
    expect(c1.installments[1].interest + c1.installments[1].capital).toBe(toCents(539_333.33));
    expect(c1.installments.reduce((t, q) => t + q.interest, 0)).toBe(toCents(988_000));
    const net = computeNetwork(seed, "2026-06-30");
    const ids = ["LP101", "LP102", "LR201", "LP103", "LP104", "LP105"];
    const sum = net.rows.filter((r) => ids.includes(r.id)).reduce((t, r) => t + r.provision, 0);
    expect(sum).toBe(toCents(623_900));
  });
  it("recalcula la red en menos de 2 segundos", () => {
    const t0 = performance.now();
    computeNetwork(seed, "2026-11-05");
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

function newLoan(s: State, id: string, associateId: string, amount: number): Loan {
  return {
    id,
    code: id,
    associateId,
    branchId: "VT",
    type: "personal",
    system: "frances",
    principal: amount,
    tnaBps: s.config.personalTnaBps,
    n: 12,
    startDate: "2026-11-05",
    firstDue: "2026-12-05",
    installments: installmentsFromSchedule(buildSchedule("frances", amount, s.config.personalTnaBps, 12, "2026-12-05")),
    status: "vigente",
    credit: 0,
    approvedTs: Date.now(),
  };
}

describe("Bitácora, deshacer y estado al…", () => {
  it("deshacer una aprobación devuelve capacidad y tope; 60 pasos ida y vuelta", async () => {
    const store = new AppStore();
    await store.init(async () => structuredClone(seed));
    const cap0 = capacityOf(store.state).capacity;
    const tope0 = topeOf(store.state);
    const assoc = Object.keys(store.state.associates)[50];
    for (let k = 0; k < 60; k++) {
      await store.dispatch({ type: "APPROVE_LOAN", entity: "Préstamo", entityId: `T${k}`, summary: "test", payload: { loan: newLoan(store.state, `T${k}`, assoc, toCents(1000)) } });
    }
    expect(capacityOf(store.state).capacity).toBe(cap0 - toCents(60_000));
    const midTs = store.events[29].ts;
    for (let k = 0; k < 60; k++) expect((await store.undo()).ok).toBe(true);
    expect(capacityOf(store.state).capacity).toBe(cap0);
    expect(topeOf(store.state)).toBe(tope0);
    for (let k = 0; k < 60; k++) expect((await store.redo()).ok).toBe(true);
    expect(capacityOf(store.state).capacity).toBe(cap0 - toCents(60_000));
    const at = await store.stateAt(midTs);
    expect(capacityOf(at.state).capacity).toBe(cap0 - toCents(30_000));
    expect(at.notice).toBeNull();
    const after = await store.stateAt(Date.now() + 1e9);
    expect(after.notice).toBe("No hay eventos posteriores a esta fecha");
  });

  it("el cambio de tasa no toca préstamos otorgados y queda en la bitácora", async () => {
    const store = new AppStore();
    await store.init(async () => structuredClone(seed));
    const before = JSON.stringify(store.state.loans.LC3.installments);
    await store.dispatch({ type: "UPDATE_CONFIG", entity: "Configuración", entityId: "config", summary: "TNA personal 50 %", payload: { patch: { personalTnaBps: 5000 } } });
    expect(store.state.config.personalTnaBps).toBe(5000);
    expect(JSON.stringify(store.state.loans.LC3.installments)).toBe(before);
    expect(store.events.at(-1)?.type).toBe("UPDATE_CONFIG");
  });

  it("aprobación concurrente que supera el tope queda observada", async () => {
    const store = new AppStore();
    await store.init(async () => structuredClone(seed));
    const tope = topeOf(store.state);
    const assoc = "A01000";
    const half = Math.floor(tope * 0.6);
    await store.dispatch({ type: "APPROVE_LOAN", entity: "Préstamo", entityId: "X1", summary: "x", payload: { loan: newLoan(store.state, "X1", assoc, half) } });
    await store.dispatch({ type: "APPROVE_LOAN", entity: "Préstamo", entityId: "X2", summary: "x", payload: { loan: newLoan(store.state, "X2", assoc, half) } });
    expect(store.state.loans.X1.status).toBe("vigente");
    expect(store.state.loans.X2.status).toBe("observada");
    const c = Object.values(store.state.conflicts)[0];
    expect(c.keptLoanId).toBe("X1");
    await store.dispatch({ type: "RESOLVE_CONFLICT", entity: "Conflicto", entityId: c.id, summary: "x", payload: { conflictId: c.id, keepLoanId: "X2", dropLoanId: "X1", decision: "Se mantiene X2" } });
    expect(store.state.loans.X1.status).toBe("anulado");
    expect(store.state.loans.X2.status).toBe("vigente");
  });

  it("no deshace un pago cuyo saldo a favor ya se usó", async () => {
    const store = new AppStore();
    await store.init(async () => structuredClone(seed));
    const loan = newLoan(store.state, "Y1", "A01001", toCents(100_000));
    await store.dispatch({ type: "APPROVE_LOAN", entity: "Préstamo", entityId: "Y1", summary: "x", payload: { loan } });
    const p1 = await store.dispatch({ type: "REGISTER_PAYMENT", entity: "Pago", entityId: "Q1", summary: "x", payload: { paymentId: "Q1", loanId: "Y1", date: "2026-12-05", amount: toCents(20_000) } });
    expect(store.state.loans.Y1.credit).toBeGreaterThan(0);
    await store.dispatch({ type: "REGISTER_PAYMENT", entity: "Pago", entityId: "Q2", summary: "x", payload: { paymentId: "Q2", loanId: "Y1", date: "2027-01-05", amount: toCents(1000) } });
    expect(store.canUndo(p1)).toEqual({ ok: false, message: "Primero deshacé el pago que usó este saldo a favor" });
  });
});
