import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { applyPayment, capitalPending, dueSummary, formatARS } from "@/engine";
import { useStore, useToday } from "@/data/StoreProvider";
import { AmountInput, D, Field, KV, Money, Notice, PageHeader } from "@/components/common";
import { LoanPicker } from "@/components/LoanPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead } from "@/lib/meta";

export const Route = createFileRoute("/cobranza")({
  validateSearch: (s: Record<string, unknown>): { prestamo?: string } => ({ prestamo: typeof s.prestamo === "string" ? s.prestamo : undefined }),
  head: () => pageHead("Cobranza", "Registrar pagos con imputación exacta por cuota: punitorio, interés y capital."),
  component: Cobranza,
});

function Cobranza() {
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const search = Route.useSearch();
  const [loanId, setLoanId] = useState<string | undefined>(search.prestamo);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState<number | null>(null);
  const loan = loanId ? s.loans[loanId] : undefined;
  const due = loan ? dueSummary(loan.installments, loan.tnaBps, date) : null;
  const preview = useMemo(() => (loan && amount && amount > 0 ? applyPayment(loan.installments, loan.tnaBps, date, amount, loan.credit) : null), [loan, amount, date, store.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    if (!loan || !amount || !preview) return;
    const paymentId = `PG-${Date.now().toString(36).toUpperCase()}`;
    await store.dispatch({
      type: "REGISTER_PAYMENT",
      entity: "Pago",
      entityId: paymentId,
      summary: `Cobró ${formatARS(amount)} del préstamo ${loan.code} (fecha ${date.split("-").reverse().join("/")})`,
      payload: { paymentId, loanId: loan.id, date, amount },
      before: { saldoCapital: capitalPending(loan.installments), saldoAFavor: loan.credit },
      after: { saldoCapital: capitalPending(preview.installments), saldoAFavor: preview.creditAfter },
    });
    toast.success(`Pago registrado en ${loan.code}`);
    setAmount(null);
  };

  return (
    <div>
      <PageHeader title="Cobranza" subtitle="Imputa a las cuotas vencidas a la fecha del pago, de la más vieja a la más nueva." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <section className="panel space-y-4 p-4">
          <Field label="Préstamo">
            <LoanPicker state={s} value={loanId} onSelect={(l) => setLoanId(l.id)} />
          </Field>
          <Field label="Fecha del pago" htmlFor="fecha">
            <Input id="fecha" type="date" className={inputCls} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Monto recibido" htmlFor="monto">
            <AmountInput id="monto" value={amount} onChange={setAmount} />
          </Field>
          {loan && due && (
            <div className="divide-y rounded-md bg-secondary px-3">
              <KV k="Exigible a la fecha" v={<Money c={due.total} />} strong />
              <KV k="Punitorio" v={<Money c={due.penalty} />} />
              <KV k="Interés" v={<Money c={due.interest} />} />
              <KV k="Capital vencido" v={<Money c={due.capital} />} />
              <KV k="Saldo a favor disponible" v={<Money c={loan.credit} />} />
            </div>
          )}
          {loan && due && due.total > loan.credit && (
            <Button variant="outline" className="w-full" onClick={() => setAmount(due.total - loan.credit)}>
              Cargar el exigible ({formatARS(due.total - loan.credit)})
            </Button>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="text-lg font-bold">Vista previa de la imputación</h2>
          {!loan && <p className="mt-1 text-sm text-muted-foreground">Elegí un préstamo, la fecha y el monto.</p>}
          {loan && !preview && <p className="mt-1 text-sm text-muted-foreground">Ingresá el monto recibido.</p>}
          {preview && (
            <>
              {preview.allocations.length === 0 && <Notice tone="warn">No hay cuotas vencidas a esa fecha: todo el monto queda como saldo a favor, sin adelantar capital.</Notice>}
              {preview.allocations.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-1.5 text-left">Cuota</th>
                        <th className="num">Días pun.</th>
                        <th className="num">Punitorio</th>
                        <th className="num">Interés</th>
                        <th className="num">Capital</th>
                        <th className="num">Queda capital</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.allocations.map((a) => (
                        <tr key={a.n} className="border-t">
                          <td className="py-1.5">
                            {a.n} · <D d={a.due} /> {a.settled && <span className="ml-1 text-xs font-semibold text-primary">cancelada</span>}
                          </td>
                          <td className="num">{a.penaltyDays}</td>
                          <td className="num">{formatARS(a.penalty, false)}</td>
                          <td className="num">{formatARS(a.interest, false)}</td>
                          <td className="num">{formatARS(a.capital, false)}</td>
                          <td className="num">{formatARS(a.remainingCapital, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 divide-y rounded-md bg-secondary px-3">
                <KV k="Monto recibido" v={<Money c={amount ?? 0} />} />
                <KV k="Saldo a favor usado" v={<Money c={preview.creditUsed} />} />
                <KV k="Imputado" v={<Money c={preview.applied} />} />
                <KV k="Queda como saldo a favor" v={<Money c={preview.creditAfter} />} strong />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="action" size="xl" onClick={confirm}>
                  Confirmar pago
                </Button>
                <Button asChild variant="outline" size="xl">
                  <Link to="/prestamos/$id" params={{ id: loan!.id }}>
                    Ver préstamo
                  </Link>
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
