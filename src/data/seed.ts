import {
  addDays,
  addMonthsClamped,
  applyPayment,
  buildSchedule,
  capitalPending,
  dueSummary,
  frenchSchedule,
  installmentsFromSchedule,
  isPaid,
  lastDayOfMonth,
  maturityDate,
  monthlyInterest,
  toCents,
  type Installment,
  type ISODate,
  type LoanType,
} from "@/engine";
import { BRANCHES, SEED, SEED_REF, USERS, defaultConfig } from "./config";
import type { Associate, AssociateCategory, Deposit, Loan, Payment, State } from "./types";
import { capacityOf, portfolioTotal, savingsTotal } from "./selectors";

/** PRNG determinista mulberry32. */
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_M = ["Juan Carlos", "Ramiro", "Héctor", "Osvaldo", "Raúl", "Sergio", "Gustavo", "Marcelo", "Daniel", "Hugo", "Rubén", "Néstor", "Pablo", "Diego", "Fernando", "Alberto", "Omar", "Ricardo", "Walter", "Mario", "Luis", "Jorge", "Matías", "Lucas", "Facundo", "Ezequiel", "Germán", "Mauricio", "Cristian", "Hernán", "Eduardo", "Carlos Alberto", "Rodolfo", "Ariel", "Nicolás", "Franco", "Gonzalo", "Leandro", "Darío", "Aldo"];
const FIRST_F = ["Elsa Beatriz", "Graciela", "Susana", "Mirta", "Norma", "Silvia", "Liliana", "Marta", "Stella Maris", "Alicia", "Mónica", "Patricia", "Claudia", "Analía", "Mariela", "Viviana", "Lorena", "Carina", "Romina", "Valeria", "Natalia", "Florencia", "Agustina", "Carolina", "Celina", "Noemí", "Teresa", "Delia", "Nélida", "Irma", "Adriana", "María Laura", "María José", "Gabriela", "Sandra", "Daniela", "Cecilia", "Julieta", "Ana María", "Rosa"];
const LAST = ["Bertolotti", "Funes", "Moretti", "Giuliani", "Ferrero", "Bustos", "Mansilla", "Albornoz", "Rinaldi", "Pereyra", "Gómez", "Rodríguez", "Fernández", "López", "Martínez", "González", "Pérez", "Sánchez", "Romero", "Díaz", "Álvarez", "Torres", "Ruiz", "Ramírez", "Flores", "Acosta", "Benítez", "Medina", "Herrera", "Aguirre", "Gutiérrez", "Rossi", "Bianchi", "Bonetto", "Cavallero", "Marchetti", "Lombardi", "Peretti", "Zanetti", "Bruno", "Gallo", "Costa", "Fontana", "Mancini", "Vitali", "Ghio", "Tosco", "Bertone", "Paladini", "Scarafía", "Cerutti", "Bossio", "Fiorito", "Gentile", "Mazzola", "Sosa", "Ledesma", "Ojeda", "Quiroga", "Villalba", "Ríos", "Cabrera", "Maldonado", "Vega", "Molina", "Castro", "Ortiz", "Suárez", "Luna", "Godoy", "Peralta", "Domínguez", "Carrizo", "Arias", "Figueroa", "Correa", "Toledo", "Juárez", "Ponce", "Vera"];
const OCCUP = ["Productor agropecuario", "Contratista rural", "Jubilado/a", "Docente", "Comerciante", "Empleado/a de comercio", "Metalúrgico/a", "Transportista", "Enfermero/a", "Empleado/a municipal", "Mecánico/a", "Acopiador", "Veterinario/a", "Albañil", "Peluquero/a", "Ama de casa", "Electricista", "Contador/a", "Tambero", "Maestro/a rural"];
const VEHICLES = ["Toyota Hilux 2.8 SRV 2021", "Ford Ranger XLT 2020", "Volkswagen Amarok V6 2022", "Chevrolet S10 LTZ 2019", "Fiat Cronos Drive 2022", "Peugeot 208 Allure 2021", "Renault Kangoo 2020", "Toyota Etios XLS 2019", "Fiat Strada Volcano 2023", "Nissan Frontier 2021", "Ford Territory 2023", "Volkswagen Gol Trend 2018"];

export interface SeedProgress {
  phase: string;
  done: number;
  total: number;
}

const dayTs = (d: ISODate, hour = 10) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, hour, 0, 0).getTime();
};

function mkLoan(
  id: string,
  code: string,
  associateId: string,
  branchId: string,
  type: LoanType,
  principal: number,
  tnaBps: number,
  n: number,
  firstDue: ISODate,
  extra: Partial<Loan> = {},
): Loan {
  const system = type === "personal" ? "frances" : "aleman";
  return {
    id,
    code,
    associateId,
    branchId,
    type,
    system,
    principal,
    tnaBps,
    n,
    firstDue,
    startDate: addMonthsClamped(firstDue, -1),
    installments: installmentsFromSchedule(buildSchedule(system, principal, tnaBps, n, firstDue)),
    status: "vigente",
    credit: 0,
    approvedTs: dayTs(addMonthsClamped(firstDue, -1), 9),
    ...extra,
  };
}

export function generateSeed(seed = SEED, onProgress?: (p: SeedProgress) => void): State {
  const rnd = mulberry32(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const ref = SEED_REF;
  const associates: Record<string, Associate> = {};
  const loans: Record<string, Loan> = {};
  const payments: Record<string, Payment> = {};
  const deposits: Record<string, Deposit> = {};
  let payCount = 0;
  const report = (phase: string, done: number, total: number) => onProgress?.({ phase, done, total });

  // ---- Asociados
  const N_ASSOC = 1200;
  const named: [string, string, string][] = [
    ["Ramiro", "Bertolotti", "Productor agropecuario"],
    ["Elsa Beatriz", "Funes", "Jubilado/a"],
    ["Héctor", "Moretti", "Acopiador"],
  ];
  const branchIds = BRANCHES.map((b) => b.id);
  for (let i = 0; i < N_ASSOC; i++) {
    const fem = rnd() < 0.5;
    const nm = named[i];
    const first = nm ? nm[0] : pick(fem ? FIRST_F : FIRST_M);
    const last = nm ? nm[1] : `${pick(LAST)}${rnd() < 0.12 ? " " + pick(LAST) : ""}`;
    const id = `A${String(i + 1).padStart(5, "0")}`;
    const year = int(1975, 2025);
    associates[id] = {
      id,
      number: 1000 + i * 3 + int(0, 2),
      name: `${last}, ${first}`,
      dni: String(int(8_000_000, 44_000_000)).replace(/\B(?=(\d{3})+(?!\d))/g, "."),
      branchId: i < 3 ? (i === 1 ? "FI" : "VT") : branchIds[Math.floor(Math.pow(rnd(), 1.4) * branchIds.length)],
      category: (rnd() < 0.72 ? "Activo" : rnd() < 0.7 ? "Adherente" : "Participante") as AssociateCategory,
      occupation: nm ? nm[2] : pick(OCCUP),
      since: `${year}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
    };
    if (i % 200 === 0) report("Asociados", i, N_ASSOC);
  }
  const assocIds = Object.keys(associates);

  // ---- Simulación de pagos de un préstamo
  const simulatePayments = (loan: Loan, profile: "bueno" | "irregular" | "moroso") => {
    let qs: Installment[] = loan.installments;
    let credit = 0;
    const stopAt = profile === "moroso" ? int(1, Math.max(1, loan.n - 1)) : Infinity;
    for (const q of loan.installments) {
      if (q.n >= stopAt) break;
      const delay = profile === "bueno" ? (rnd() < 0.85 ? 0 : int(1, 6)) : int(0, 45);
      const date = addDays(q.due, delay);
      if (date > ref) break;
      if (qs[q.n - 1] && isPaid(qs[q.n - 1])) continue;
      let amount = dueSummary(qs, loan.tnaBps, date).total - credit;
      if (amount <= 0) continue;
      if (profile !== "bueno" && rnd() < 0.08) amount = Math.round(amount * 0.6);
      const r = applyPayment(qs, loan.tnaBps, date, amount, credit);
      qs = r.installments;
      credit = r.creditAfter;
      const pid = `PG${String(++payCount).padStart(6, "0")}`;
      payments[pid] = { id: pid, loanId: loan.id, date, amount, creditUsed: r.creditUsed, creditAfter: r.creditAfter, ts: dayTs(date, 11) };
    }
    loan.installments = qs;
    loan.credit = credit;
    if (qs.every(isPaid)) loan.status = "cancelado";
  };

  // ---- Cartera generada
  const N_LOANS = 1300;
  for (let i = 0; i < N_LOANS; i++) {
    const type: LoanType = rnd() < 0.72 ? "personal" : "prendario";
    const assoc = associates[pick(assocIds.slice(3))];
    const n = type === "personal" ? pick([6, 9, 12, 12, 18, 24]) : pick([12, 18, 24, 24, 36]);
    const principal =
      type === "personal" ? toCents(Math.round((150_000 + Math.pow(rnd(), 1.6) * 2_350_000) / 1000) * 1000) : toCents(Math.round((3_000_000 + Math.pow(rnd(), 1.4) * 17_000_000) / 10000) * 10000);
    const monthsAgo = int(1, Math.min(n + 6, 30));
    const refMonth = addMonthsClamped(ref, -monthsAgo);
    const [ry, rm] = refMonth.split("-").map(Number);
    const day = rnd() < 0.05 ? lastDayOfMonth(ry, rm) : int(1, 28);
    const fd = `${refMonth.slice(0, 8)}${String(day).padStart(2, "0")}`;
    const tna = type === "personal" ? pick([4200, 4500, 4500, 4800]) : pick([3500, 3800, 3800, 4000]);
    const id = `L${String(i + 1).padStart(5, "0")}`;
    const code = `${type === "personal" ? "P" : "R"}-${String(10_000 + i)}`;
    const loan = mkLoan(id, code, assoc.id, assoc.branchId, type, principal, tna, n, fd, {
      appraisal: type === "prendario" ? Math.round(principal / (0.45 + rnd() * 0.25) / 100000) * 100000 : undefined,
      vehicle: type === "prendario" ? pick(VEHICLES) : undefined,
    });
    const r = rnd();
    simulatePayments(loan, r < 0.8 ? "bueno" : r < 0.92 ? "irregular" : "moroso");
    loans[id] = loan;
    if (i % 100 === 0) report("Cartera y cobranzas", i, N_LOANS);
  }

  // ---- Préstamos de los casos de prueba (ejemplos reconocibles)
  const A = (i: number) => assocIds[i];
  const c1 = mkLoan("LC1", "R-4800", A(0), "VT", "prendario", toCents(4_800_000), 3800, 12, "2026-02-15", {
    appraisal: toCents(9_500_000),
    vehicle: "Toyota Hilux 2.8 DX 2019",
    sample: "Caso 1: prendario alemán 4.800.000 a 12 cuotas al 38 %",
  });
  simulatePaymentsFixed(c1, ["2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"]);
  loans[c1.id] = c1;

  const c3 = mkLoan("LC3", "P-900", A(4), "FI", "personal", toCents(900_000), 4500, 6, "2026-01-10", {
    sample: "Caso 3: pagos parciales sobre dos cuotas vencidas",
  });
  for (const [date, amt] of [
    ["2026-01-10", 170_290.98],
    ["2026-03-25", 250_000],
    ["2026-04-10", 300_000],
    ["2026-05-10", 137_221.76],
  ] as [string, number][]) {
    const r = applyPayment(c3.installments, c3.tnaBps, date, toCents(amt), c3.credit);
    c3.installments = r.installments;
    c3.credit = r.creditAfter;
    const pid = `PG${String(++payCount).padStart(6, "0")}`;
    payments[pid] = { id: pid, loanId: c3.id, date, amount: toCents(amt), creditUsed: r.creditUsed, creditAfter: r.creditAfter, ts: dayTs(date, 11) };
  }
  loans[c3.id] = c3;

  const case4 = "Caso 4: previsiones al corte 30/06/2026";
  loans.LP101 = mkLoan("LP101", "P-101", A(5), "VT", "personal", toCents(1_200_000), 4500, 12, "2026-07-10", { sample: case4 });
  loans.LP102 = mkLoan("LP102", "P-102", A(6), "RU", "personal", toCents(800_000), 4500, 12, "2026-04-30", { sample: case4 });
  loans.LR201 = mkLoan("LR201", "R-201", A(7), "CA", "prendario", toCents(2_500_000), 3800, 24, "2026-03-31", {
    sample: case4,
    appraisal: toCents(5_000_000),
    vehicle: "Ford Ranger XL 2018",
  });
  loans.LP103 = mkLoan("LP103", "P-103", A(8), "VT", "personal", toCents(640_000), 4500, 12, "2026-05-30", { sample: case4 });
  loans.LP104 = mkLoan("LP104", "P-104", A(9), "EL", "personal", toCents(410_000), 4500, 12, "2026-05-29", { sample: case4 });
  // P-105: refinanciado en categoría 3 con 2 cuotas pagadas en fecha y capital 980.000
  const rest = frenchSchedule(toCents(980_000), 4500, 12, "2026-07-05");
  const paid: Installment[] = ["2026-05-05", "2026-06-05"].map((due, k) => {
    const bal = toCents(1_000_000) - k * toCents(10_000);
    const interest = monthlyInterest(bal, 4500);
    return { n: k + 1, due, capital: toCents(10_000), interest, paidCapital: toCents(10_000), paidInterest: interest, penalty: 0, paidPenalty: 0, lastPenaltyDate: null, paidOffDate: due };
  });
  const p105 = mkLoan("LP105", "P-105", A(10), "VT", "personal", toCents(1_000_000), 4500, 14, "2026-05-05", {
    sample: case4,
    refi: { fromLoanId: "", category: 3, fromN: 1 },
  });
  p105.installments = [...paid, ...installmentsFromSchedule(rest).map((q, k) => ({ ...q, n: k + 3 }))];
  loans.LP105 = p105;

  // ---- Depósitos a término
  const N_DEP = 1500;
  const terms = [30, 60, 90, 180];
  const passive: Record<number, number> = { 30: 2800, 60: 2900, 90: 3000, 180: 3200 };
  for (let i = 0; i < N_DEP; i++) {
    const assoc = associates[pick(assocIds)];
    const term = pick(terms);
    const vig = rnd() < 0.8;
    const start = vig ? addDays(ref, -int(0, term - 1)) : addDays(ref, -int(term + 1, term + 400));
    const id = `D${String(i + 1).padStart(5, "0")}`;
    const capital = toCents(Math.round((100_000 + Math.pow(rnd(), 2.2) * 4_800_000) / 1000) * 1000);
    deposits[id] = {
      id,
      code: `PF-${String(50_000 + i)}`,
      associateId: assoc.id,
      branchId: assoc.branchId,
      capital,
      termDays: term,
      tnaBps: passive[term],
      start,
      maturity: maturityDate(start, term),
      status: vig ? "vigente" : "pagado",
      closedOn: vig ? undefined : maturityDate(start, term),
    };
    if (i % 300 === 0) report("Ahorro a término", i, N_DEP);
  }
  // Depósito grande de casa central que vence hoy y no se renueva (escenario)
  deposits.DBIG = {
    id: "DBIG",
    code: "PF-90001",
    associateId: A(2),
    branchId: "VT",
    capital: toCents(150_000_000),
    termDays: 90,
    tnaBps: 3000,
    start: addDays(ref, -90),
    maturity: ref,
    status: "vigente",
  };

  const state: State = {
    config: defaultConfig(),
    branches: BRANCHES,
    users: USERS,
    associates,
    loans,
    payments,
    deposits,
    conflicts: {},
    dailyUsed: {},
    seedRecords: 0,
  };
  // Calibra el capital propio afectado para una capacidad prestable de ejemplo de unos 185 millones.
  const sv = savingsTotal(state);
  const pf = portfolioTotal(state);
  const encaje = Math.round((sv * 15) / 100);
  const own = Math.ceil((toCents(185_000_000) + encaje + pf - sv) / toCents(1_000_000)) * toCents(1_000_000);
  state.config.ownCapital = Math.max(toCents(50_000_000), own);
  let inst = 0;
  for (const id in loans) inst += loans[id].installments.length;
  state.seedRecords = assocIds.length + Object.keys(loans).length + inst + Object.keys(payments).length + Object.keys(deposits).length;
  void capacityOf;
  void capitalPending;
  report("Listo", 1, 1);
  return state;

  function simulatePaymentsFixed(loan: Loan, dates: ISODate[]) {
    for (const date of dates) {
      const amount = dueSummary(loan.installments, loan.tnaBps, date).total;
      const r = applyPayment(loan.installments, loan.tnaBps, date, amount, loan.credit);
      loan.installments = r.installments;
      loan.credit = r.creditAfter;
      const pid = `PG${String(++payCount).padStart(6, "0")}`;
      payments[pid] = { id: pid, loanId: loan.id, date, amount, creditUsed: r.creditUsed, creditAfter: r.creditAfter, ts: dayTs(date, 11) };
    }
  }
}
