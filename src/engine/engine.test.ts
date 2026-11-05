import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  applyPayment,
  canUndoPayment,
  capitalPending,
  computeCapacity,
  daysLate,
  dueSummary,
  effectiveEvents,
  evaluateLoan,
  evaluateQueue,
  formatARS,
  formatBps,
  formatDate,
  frenchSchedule,
  germanSchedule,
  buildSchedule,
  installmentsFromSchedule,
  installmentStatus,
  onTimeStreak,
  parseARS,
  parseDMY,
  precancel,
  provisionFor,
  provisionTotal,
  scheduleTotals,
  simpleInterest,
  simulateRefinance,
  stateAtNotice,
  toCents,
  topeFor,
  effectiveCategory,
  maturityDate,
  divHalfUp,
  MSG,
  type Installment,
} from "./index";

const $ = toCents;

describe("Caso 1 — prendario alemán", () => {
  const rows = germanSchedule($(4_800_000), 3800, 12, "2026-02-15");
  it("capital 400.000 en cada cuota y cuotas 1, 2, 3 y 12 exactas", () => {
    expect(rows.every((r) => r.capital === $(400_000))).toBe(true);
    expect([rows[0].interest, rows[0].total]).toEqual([$(152_000), $(552_000)]);
    expect([rows[1].interest, rows[1].total]).toEqual([$(139_333.33), $(539_333.33)]);
    expect([rows[2].interest, rows[2].total]).toEqual([$(126_666.67), $(526_666.67)]);
    expect(rows[11].due).toBe("2027-01-15");
    expect([rows[11].interest, rows[11].total]).toEqual([$(12_666.67), $(412_666.67)]);
  });
  it("totales", () => {
    const t = scheduleTotals(rows);
    expect(t.interest).toBe($(988_000));
    expect(t.total).toBe($(5_788_000));
  });
});

describe("Caso 2 — tope que baja con cada aprobación", () => {
  const base = { savings: $(25_000_000 + 18_400_000 + 6_600_000), ownCapital: $(30_000_000), encajeBps: 1500, portfolio: $(41_000_000) };
  const res = evaluateQueue(base, 800, [
    { id: "A", amount: $(2_000_000), associateBalance: $(520_000) },
    { id: "B", amount: $(2_400_000), associateBalance: 0 },
    { id: "C", amount: $(2_360_000), associateBalance: 0 },
    { id: "D", amount: $(2_021_200.01), associateBalance: $(150_000) },
  ]);
  it("aprobado, rechazado, aprobado, rechazado con máximos al centavo", () => {
    expect(res.map((r) => r.ok)).toEqual([true, false, true, false]);
    expect(res[0].capacityBefore).toBe($(31_500_000));
    expect(res[0].tope).toBe($(2_520_000));
    expect(res[0].capacityAfter).toBe($(29_500_000));
    expect(res[1].tope).toBe($(2_360_000));
    expect(res[1].message).toBe("Supera el tope por asociado: máximo disponible $ 2.360.000,00");
    expect(res[2].capacityAfter).toBe($(27_140_000));
    expect(res[3].tope).toBe($(2_171_200));
    expect(res[3].message).toBe("Supera el tope por asociado: máximo disponible $ 2.021.200,00");
  });
});

function case3Loan() {
  const rows = frenchSchedule($(900_000), 4500, 6, "2026-01-10");
  return { rows, qs: installmentsFromSchedule(rows) };
}

describe("Caso 3 — pagos parciales sobre dos cuotas vencidas", () => {
  const { rows, qs } = case3Loan();
  it("cronograma francés", () => {
    expect(rows[0].total).toBe($(170_290.98));
    expect(rows[5].total).toBe($(170_290.95));
    expect([rows[1].interest, rows[1].capital]).toEqual([$(28_629.71), $(141_661.27)]);
    expect([rows[2].interest, rows[2].capital]).toEqual([$(23_317.42), $(146_973.56)]);
    expect([rows[3].interest, rows[3].capital]).toEqual([$(17_805.91), $(152_485.07)]);
    expect([rows[4].interest, rows[4].capital]).toEqual([$(12_087.72), $(158_203.26)]);
  });
  it("imputación exacta", () => {
    const p1 = applyPayment(qs, 4500, "2026-01-10", $(170_290.98));
    expect(p1.creditAfter).toBe(0);
    expect(p1.allocations[0].penalty).toBe(0);
    const p2 = applyPayment(p1.installments, 4500, "2026-03-25", $(250_000));
    const [a2, a3] = p2.allocations;
    expect(a2).toMatchObject({ n: 2, penaltyDays: 43, penaltyLiquidated: $(3_754.99), penalty: $(3_754.99), interest: $(28_629.71), capital: $(141_661.27) });
    expect(a3).toMatchObject({ n: 3, penaltyDays: 15, penaltyLiquidated: $(1_359), penalty: $(1_359), interest: $(23_317.42), capital: $(51_277.61) });
    expect(a3.remainingCapital).toBe($(95_695.95));
    const p3 = applyPayment(p2.installments, 4500, "2026-04-10", $(300_000), p2.creditAfter);
    expect(p3.allocations[0]).toMatchObject({ n: 3, penaltyDays: 16, penalty: $(943.85), settled: true });
    expect(p3.allocations[1]).toMatchObject({ n: 4, penalty: 0, settled: true });
    expect(p3.creditAfter).toBe($(33_069.22));
    const p4 = applyPayment(p3.installments, 4500, "2026-05-10", $(137_221.76), p3.creditAfter);
    expect(p4.allocations[0]).toMatchObject({ n: 5, settled: true, remainingCapital: 0 });
    expect(p4.creditAfter).toBe(0);
    expect(p4.creditUsed).toBe($(33_069.22));
  });
});

describe("Caso 4 — previsiones con límites exactos (corte 30/06/2026)", () => {
  const cut = "2026-06-30";
  const d = (due: string) => daysLate([{ n: 1, due, capital: 1, interest: 0, paidCapital: 0, paidInterest: 0, penalty: 0, paidPenalty: 0, lastPenaltyDate: null, paidOffDate: null }], cut);
  const rows = [
    provisionFor({ id: "P-101", type: "personal", capital: $(1_200_000), days: d("2026-07-10") }),
    provisionFor({ id: "P-102", type: "personal", capital: $(800_000), days: d("2026-04-30") }),
    provisionFor({ id: "R-201", type: "prendario", capital: $(2_500_000), days: d("2026-03-31") }),
    provisionFor({ id: "P-103", type: "personal", capital: $(640_000), days: d("2026-05-30") }),
    provisionFor({ id: "P-104", type: "personal", capital: $(410_000), days: d("2026-05-29") }),
    provisionFor({ id: "P-105", type: "personal", capital: $(980_000), days: 0, refiCategory: 3, streak: 2 }),
  ];
  it("categorías, días y previsiones", () => {
    expect(rows.map((r) => r.days)).toEqual([0, 61, 91, 31, 32, 0]);
    expect(rows.map((r) => r.category)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(rows.map((r) => r.provision)).toEqual([$(12_000), $(40_000), $(300_000), $(6_400), $(20_500), $(245_000)]);
    expect(provisionTotal(rows)).toBe($(623_900));
  });
});

describe("Casos borde", () => {
  it("1. prendario > 70 % de la tasación", () => {
    const r = evaluateLoan({ type: "prendario", amount: $(7_000_001), appraisal: $(10_000_000), associateBalance: 0, capacity: $(500_000_000), topeBps: 800 });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("El monto supera el 70 % de la tasación: máximo $ 7.000.000,00");
  });
  it("2. exactamente el tope se aprueba; un centavo más se rechaza", () => {
    const capacity = $(10_000_000);
    expect(topeFor(capacity, 800)).toBe($(800_000));
    expect(evaluateLoan({ type: "personal", amount: $(700_000), associateBalance: $(100_000), capacity, topeBps: 800 }).ok).toBe(true);
    const r = evaluateLoan({ type: "personal", amount: $(700_000.01), associateBalance: $(100_000), capacity, topeBps: 800 });
    expect(r.message).toBe("Supera el tope por asociado: máximo disponible $ 700.000,00");
  });
  it("3. primer vencimiento un día 31", () => {
    const dues = Array.from({ length: 5 }, (_, k) => addMonthsClamped("2026-01-31", k));
    expect(dues).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });
  const qs = installmentsFromSchedule(frenchSchedule($(900_000), 4500, 6, "2026-01-10"));
  it("4. pago el día del vencimiento sin punitorio; al día siguiente un día", () => {
    expect(applyPayment(qs, 4500, "2026-01-10", $(170_290.98)).allocations[0].penalty).toBe(0);
    const next = applyPayment(qs, 4500, "2026-01-11", $(200_000)).allocations[0];
    expect(next.penaltyDays).toBe(1);
    expect(next.penalty).toBe(Math.round((13654098 * 4500) / 7300000));
  });
  it("5. pago que solo alcanza para el punitorio", () => {
    const r = applyPayment(qs, 4500, "2026-02-09", $(100));
    expect(r.allocations[0]).toMatchObject({ interest: 0, capital: 0, penalty: $(100) });
    expect(r.installments[0].paidInterest).toBe(0);
    expect(r.installments[0].paidCapital).toBe(0);
  });
  it("6. pago mayor que lo vencido: sobrante a saldo a favor sin reducir cuotas futuras", () => {
    const r = applyPayment(qs, 4500, "2026-01-10", $(500_000));
    expect(r.creditAfter).toBe($(500_000 - 170_290.98));
    expect(r.installments[1].paidCapital).toBe(0);
    expect(capitalPending(r.installments)).toBe($(900_000) - qs[0].capital);
  });
  it("7. precancelación a los 29 días", () => {
    expect(precancel($(1_000_000), 2800, "2026-01-01", "2026-01-30").message).toBe("No se puede precancelar antes de los 30 días");
    const ok = precancel($(1_000_000), 2800, "2026-01-01", "2026-01-31");
    expect(ok.ok).toBe(true);
    expect(ok.interest).toBe(simpleInterest($(1_000_000), 1400, 30));
  });
  it("8. vencimiento sin renovación baja la capacidad; puede quedar negativa", () => {
    const before = computeCapacity({ savings: $(10_000_000), ownCapital: $(1_000_000), encajeBps: 1500, portfolio: $(8_000_000) });
    expect(before.capacity).toBe($(1_500_000));
    const after = computeCapacity({ savings: $(6_000_000), ownCapital: $(1_000_000), encajeBps: 1500, portfolio: $(8_000_000) });
    expect(after.capacity).toBe($(-1_900_000));
    const r = evaluateLoan({ type: "personal", amount: $(1), associateBalance: 0, capacity: after.capacity, topeBps: 800 });
    expect(r.message).toBe("Capacidad prestable negativa: no se aprueban préstamos");
  });
  it("9. cupo diario en cero rechaza aunque haya capacidad", () => {
    const r = evaluateLoan({ type: "personal", amount: $(1000), associateBalance: 0, capacity: $(100_000_000), topeBps: 800, dailyQuotaRemaining: 0 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("cupo");
    const r2 = evaluateLoan({ type: "personal", amount: $(1000), associateBalance: 0, capacity: $(100_000_000), topeBps: 800, dailyQuotaRemaining: $(500) });
    expect(r2.message).toBe("Supera el cupo diario de la sucursal: disponible $ 500,00");
  });
  it("10. asociado en categoría 3 o peor", () => {
    const r = evaluateLoan({ type: "personal", amount: $(1000), associateBalance: 0, capacity: $(100_000_000), topeBps: 800, worstCategory: 3 });
    expect(r.message).toBe("El asociado tiene deuda en mora: regularizá antes de otorgar");
  });
  it("11. refinanciado mejora un nivel con 3 en fecha; un atraso reinicia", () => {
    let r = installmentsFromSchedule(frenchSchedule($(600_000), 4500, 6, "2026-01-10"));
    const pay = (date: string, n: number) => {
      const due = dueSummary(r, 4500, date).total;
      r = applyPayment(r, 4500, date, due).installments;
      expect(r[n - 1].paidOffDate).toBe(date);
    };
    pay("2026-01-10", 1);
    pay("2026-02-10", 2);
    expect(effectiveCategory(0, 3, onTimeStreak(r))).toBe(3);
    pay("2026-03-10", 3);
    expect(onTimeStreak(r)).toBe(3);
    expect(effectiveCategory(0, 3, onTimeStreak(r))).toBe(2);
    pay("2026-04-11", 4);
    expect(onTimeStreak(r)).toBe(0);
    expect(effectiveCategory(0, 3, onTimeStreak(r))).toBe(3);
  });
  it("12. el cambio de tasa no modifica cronogramas ya generados", () => {
    const original = frenchSchedule($(900_000), 4500, 6, "2026-01-10");
    const snapshot = JSON.stringify(original);
    const nuevo = frenchSchedule($(900_000), 5000, 6, "2026-01-10");
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(nuevo[0].interest).not.toBe(original[0].interest);
  });
  it("13. no se deshace un pago cuyo saldo a favor ya se usó", () => {
    const p1 = { id: "p1", loanId: "L", ts: 1, creditAfter: 500, creditUsed: 0 };
    const p2 = { id: "p2", loanId: "L", ts: 2, creditAfter: 0, creditUsed: 500 };
    expect(canUndoPayment(p1, [p1, p2])).toEqual({ ok: false, message: "Primero deshacé el pago que usó este saldo a favor" });
    expect(canUndoPayment(p1, [p1]).ok).toBe(true);
    expect(canUndoPayment(p2, [p1, p2]).ok).toBe(true);
  });
  it("14. estado al… posterior al último evento", () => {
    const evs = [{ id: "a", ts: 10, type: "X" }, { id: "b", ts: 20, type: "X" }];
    expect(stateAtNotice(evs, 25)).toBe("No hay eventos posteriores a esta fecha");
    expect(stateAtNotice(evs, 15)).toBeNull();
  });
});

describe("Utilidades", () => {
  it("formato argentino y parseo", () => {
    expect(formatARS(123456789)).toBe("$ 1.234.567,89");
    expect(formatARS(-5)).toBe("−$ 0,05");
    expect(formatARS(100, false)).toBe("1,00");
    expect(parseARS("1.234.567,89")).toBe(123456789);
    expect(parseARS("$ 4.800.000")).toBe(480000000);
    expect(parseARS("2021200.01")).toBe(202120001);
    expect(parseARS("-10,5")).toBe(-1050);
    expect(parseARS("abc")).toBeNull();
    expect(parseARS("")).toBeNull();
    expect(formatDate("2026-02-05")).toBe("05/02/2026");
    expect(parseDMY("31/02/2026")).toBeNull();
    expect(parseDMY("15/02/2026")).toBe("2026-02-15");
    expect(parseDMY("x")).toBeNull();
    expect(formatBps(4500)).toBe("45 %");
    expect(formatBps(1250)).toBe("12,5 %");
  });
  it("half-up con negativos y divisores negativos", () => {
    expect(divHalfUp(5n, 2n)).toBe(3n);
    expect(divHalfUp(-5n, 2n)).toBe(-3n);
    expect(divHalfUp(5n, -2n)).toBe(-3n);
    expect(() => divHalfUp(1n, 0n)).toThrow();
  });
  it("sistema por defecto y tasa cero", () => {
    expect(buildSchedule("frances", $(1200), 0, 12, "2026-01-01")[0].total).toBe($(100));
    expect(buildSchedule("aleman", $(1200), 3800, 12, "2026-01-01")[0].capital).toBe($(100));
  });
  it("estado de cuotas, deuda exigible y depósitos", () => {
    const qs: Installment[] = installmentsFromSchedule(frenchSchedule($(900_000), 4500, 6, "2026-01-10"));
    expect(installmentStatus(qs[0], "2026-01-05")).toBe("a vencer");
    expect(installmentStatus(qs[0], "2026-01-11")).toBe("vencida");
    const part = applyPayment(qs, 4500, "2026-01-10", $(1000)).installments;
    expect(installmentStatus(part[0], "2026-01-10")).toBe("parcial");
    const full = applyPayment(qs, 4500, "2026-01-10", $(170_290.98)).installments;
    expect(installmentStatus(full[0], "2026-02-01")).toBe("pagada");
    expect(dueSummary(qs, 4500, "2026-01-09").total).toBe(0);
    expect(dueSummary(full, 4500, "2026-02-10").total).toBe($(170_290.98));
    expect(daysLate(full, "2026-01-05")).toBe(0);
    expect(maturityDate("2026-01-01", 30)).toBe("2026-01-31");
    expect(simpleInterest($(1_000_000), 2800, 30)).toBe($(23_013.70));
  });
  it("refinanciación con condonación", () => {
    const qs = installmentsFromSchedule(frenchSchedule($(900_000), 4500, 6, "2026-01-10"));
    const p1 = applyPayment(qs, 4500, "2026-01-10", $(170_290.98)).installments;
    const sim = simulateRefinance(p1, 4500, "2026-03-25", 3000);
    expect(sim.capitalPending).toBe($(900_000) - p1[0].capital);
    expect(sim.unpaidInterest).toBe($(28_629.71 + 23_317.42));
    expect(sim.penalties).toBe($(3_754.99 + 1_359));
    expect(sim.penaltiesCharged).toBe(divHalfUpNum($(5_113.99) * 7000, 10000));
    expect(sim.newPrincipal).toBe(sim.capitalPending + sim.unpaidInterest + sim.penaltiesCharged);
    expect(sim.category).toBe(2);
    expect(sim.days).toBe(43);
  });
  it("eventos efectivos con deshacer/rehacer", () => {
    const evs = [
      { id: "a", ts: 1, type: "X" },
      { id: "b", ts: 2, type: "X" },
      { id: "u", ts: 3, type: "UNDO", payload: { targetId: "b" } },
      { id: "r", ts: 4, type: "REDO", payload: { targetId: "b" } },
    ];
    expect(effectiveEvents(evs, 3).map((e) => e.id)).toEqual(["a"]);
    expect(effectiveEvents(evs).map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("mensajes de capacidad y monto", () => {
    expect(evaluateLoan({ type: "personal", amount: 0, associateBalance: 0, capacity: 100, topeBps: 800 }).code).toBe("monto");
    expect(evaluateLoan({ type: "personal", amount: $(50), associateBalance: 0, capacity: $(40), topeBps: 20000 }).message).toBe(MSG.capacity($(40)));
    expect(topeFor(-1, 800)).toBe(0);
  });
});

function divHalfUpNum(a: number, b: number) {
  return Number(divHalfUp(BigInt(a), BigInt(b)));
}
