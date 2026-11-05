import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addMonthsClamped, buildSchedule, daysLate, formatARS, formatBps, installmentsFromSchedule, onTimeStreak, scheduleTotals, simulateRefinance } from "@/engine";
import { useStore, useToday } from "@/data/StoreProvider";
import type { Loan } from "@/data/types";
import { CategoryBadge, D, Field, KV, Money, Notice, PageHeader } from "@/components/common";
import { LoanPicker } from "@/components/LoanPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead, selectCls } from "@/lib/meta";

export const Route = createFileRoute("/refinanciacion")({
  validateSearch: (s: Record<string, unknown>): { prestamo?: string } => ({ prestamo: typeof s.prestamo === "string" ? s.prestamo : undefined }),
  head: () => pageHead("Refinanciación", "Simulación previa y alta de refinanciaciones con condonación de punitorios."),
  component: Refi,
});

function Refi() {
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [loanId, setLoanId] = useState<string | undefined>(search.prestamo);
  const [date, setDate] = useState(today);
  const [n, setN] = useState(12);
  const loan = loanId ? s.loans[loanId] : undefined;
  const sim = useMemo(
    () => (loan ? simulateRefinance(loan.installments, loan.tnaBps, date, s.config.condonationBps, loan.refi?.category, loan.refi ? onTimeStreak(loan.installments, loan.refi.fromN) : 0) : null),
    [loan, date, s.config.condonationBps, store.version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tna = loan?.type === "prendario" ? s.config.prendarioTnaBps : s.config.personalTnaBps;
  const minN = loan?.type === "prendario" ? s.config.prendarioMinN : s.config.personalMinN;
  const maxN = loan?.type === "prendario" ? s.config.prendarioMaxN : s.config.personalMaxN;
  const nOk = Math.min(maxN, Math.max(minN, n));
  const firstDue = addMonthsClamped(date, 1);
  const rows = loan && sim ? buildSchedule(loan.system, sim.newPrincipal, tna, nOk, firstDue) : [];
  const totals = scheduleTotals(rows);

  const confirm = async () => {
    if (!loan || !sim) return;
    const id = `L${Date.now().toString(36).toUpperCase()}`;
    const newLoan: Loan = {
      ...loan,
      id,
      code: `${loan.code}-RF`,
      principal: sim.newPrincipal,
      tnaBps: tna,
      n: nOk,
      startDate: date,
      firstDue,
      installments: installmentsFromSchedule(rows),
      status: "vigente",
      credit: 0,
      refi: { fromLoanId: loan.id, category: sim.category, fromN: 1 },
      approvedTs: Date.now(),
      sample: undefined,
      conflictWith: undefined,
    };
    await store.dispatch({
      type: "REFINANCE",
      entity: "Préstamo",
      entityId: loan.id,
      summary: `Refinanció ${loan.code} en ${newLoan.code} por ${formatARS(sim.newPrincipal)} (condonó ${formatARS(sim.condoned)} de punitorios)`,
      payload: { oldLoanId: loan.id, newLoan, sim },
      before: { estado: loan.status, dias: sim.days },
      after: { nuevoCapital: sim.newPrincipal, categoria: sim.category },
    });
    toast.success(`Refinanciación ${newLoan.code} registrada`);
    navigate({ to: "/prestamos/$id", params: { id } });
  };

  return (
    <div>
      <PageHeader title="Refinanciación" subtitle={`Condonación de punitorios de ejemplo: ${formatBps(s.config.condonationBps)}`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <section className="panel space-y-4 p-4">
          <Field label="Préstamo a refinanciar">
            <LoanPicker state={s} value={loanId} onSelect={(l) => setLoanId(l.id)} />
          </Field>
          <Field label="Fecha de refinanciación" htmlFor="f">
            <Input id="f" type="date" className={inputCls} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Cuotas del nuevo préstamo" htmlFor="n">
            <select id="n" className={selectCls} value={nOk} onChange={(e) => setN(Number(e.target.value))}>
              {Array.from({ length: maxN - minN + 1 }, (_, k) => minN + k).map((k) => (
                <option key={k} value={k}>
                  {k} cuotas
                </option>
              ))}
            </select>
          </Field>
          {loan && <p className="text-sm text-muted-foreground tnum">Atraso actual: {daysLate(loan.installments, date)} días</p>}
        </section>
        <section className="panel p-4">
          <h2 className="text-lg font-bold">Simulación</h2>
          {!sim && <p className="mt-1 text-sm text-muted-foreground">Elegí un préstamo vigente.</p>}
          {sim && loan && (
            <>
              <div className="mt-1 divide-y">
                <KV k="Capital pendiente total" v={<Money c={sim.capitalPending} />} />
                <KV k="Intereses impagos de cuotas vencidas" v={<Money c={sim.unpaidInterest} />} />
                <KV k="Punitorios liquidados a la fecha" v={<Money c={sim.penalties} />} />
                <KV k={`Condonación ${formatBps(s.config.condonationBps)}`} v={<Money c={-sim.condoned} />} />
                <KV k="Punitorios que se cobran" v={<Money c={sim.penaltiesCharged} />} />
                <KV k="Nuevo capital" v={<Money c={sim.newPrincipal} />} strong />
                <KV k="Categoría con la que queda" v={<CategoryBadge c={sim.category} />} />
              </div>
              <Notice>
                Nuevo préstamo {loan.type === "personal" ? "francés" : "alemán"} a {nOk} cuotas al {formatBps(tna)} · primera cuota {formatARS(rows[0]?.total ?? 0)} el <D d={firstDue} /> · intereses {formatARS(totals.interest)}. No mejora de categoría hasta pagar 3 cuotas seguidas en fecha.
              </Notice>
              <Button variant="action" size="xl" className="mt-4" onClick={confirm}>
                Confirmar refinanciación
              </Button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
