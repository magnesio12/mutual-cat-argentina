import { createFileRoute, Link } from "@tanstack/react-router";
import {
  capitalPending,
  daysBetween,
  formatARS,
  formatBps,
  installmentStatus,
  liquidatePenalty,
  scheduleTotals,
  unpaidCapital,
  unpaidInterest,
  unpaidPenalty,
} from "@/engine";
import { useStore, useToday } from "@/data/StoreProvider";
import { loanProvision } from "@/data/selectors";
import { CategoryBadge, D, KV, Money, Notice, PageHeader, Status } from "@/components/common";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";

export const Route = createFileRoute("/prestamos/$id")({
  head: () => pageHead("Detalle del préstamo", "Cronograma, punitorios y estado de cada cuota del préstamo."),
  component: Detalle,
});

function Detalle() {
  const { id } = Route.useParams();
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const l = s.loans[id];
  if (!l) return <p>No se encontró el préstamo (puede haberse deshecho la aprobación).</p>;
  const a = s.associates[l.associateId];
  const prov = loanProvision(s, l, today);
  const totals = scheduleTotals(l.installments.map((q) => ({ ...q, total: q.capital + q.interest, balanceAfter: 0 })));
  const pays = Object.values(s.payments)
    .filter((p) => p.loanId === id)
    .sort((x, y) => y.ts - x.ts);
  const conflict = Object.values(s.conflicts).find((c) => c.observedLoanId === id || c.keptLoanId === id);
  return (
    <div className="space-y-4">
      <PageHeader
        title={`Préstamo ${l.code}`}
        subtitle={
          <>
            <Link className="text-primary underline" to="/asociados/$id" params={{ id: l.associateId }}>
              {a?.name}
            </Link>{" "}
            · {l.type === "personal" ? "Personal, sistema francés" : "Prendario, sistema alemán"} · {formatBps(l.tnaBps)} TNA
          </>
        }
        actions={
          l.status === "vigente" && (
            <>
              <Button asChild variant="action">
                <Link to="/cobranza" search={{ prestamo: id }}>
                  Cobrar
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/refinanciacion" search={{ prestamo: id }}>
                  Refinanciar
                </Link>
              </Button>
            </>
          )
        }
      />
      {l.sample && <Notice>Ejemplo del catálogo · {l.sample}</Notice>}
      {l.status === "observada" && (
        <Notice tone="mora">
          Aprobación observada: no se desembolsa hasta que el gerente decida.{" "}
          <Link to="/conflictos" className="font-semibold underline">
            Ver conflicto
          </Link>
        </Notice>
      )}
      {conflict?.status === "pendiente" && l.status !== "observada" && <Notice tone="mora">Este préstamo está en un conflicto pendiente.</Notice>}
      <section className="panel grid grid-cols-1 gap-x-6 p-4 sm:grid-cols-2">
        <KV k="Estado" v={<Status s={l.status} />} />
        <KV k="Sucursal" v={s.branches.find((b) => b.id === l.branchId)?.city} />
        <KV k="Monto otorgado" v={<Money c={l.principal} />} />
        <KV k="Saldo de capital" v={<Money c={capitalPending(l.installments)} />} strong />
        <KV k="Total de intereses" v={<Money c={totals.interest} />} />
        <KV k="Total a pagar" v={<Money c={totals.total} />} />
        <KV k="Saldo a favor" v={<Money c={l.credit} />} />
        <KV k="Categoría hoy" v={<span className="inline-flex items-center gap-2"><CategoryBadge c={prov.category} /> {prov.days} días · previsión {formatARS(prov.provision)}</span>} />
        {l.appraisal && <KV k="Tasación" v={<Money c={l.appraisal} />} />}
        {l.vehicle && <KV k="Vehículo" v={l.vehicle} />}
        {l.refi && <KV k="Refinanciado en categoría" v={<CategoryBadge c={l.refi.category} />} />}
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Cronograma</h2>
        <p className="text-xs text-muted-foreground">Punitorio al día de hoy: capital impago × 50 % de la TNA × días / 365.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1.5 text-left">N.º</th>
                <th className="text-left">Vence</th>
                <th className="num">Capital</th>
                <th className="num">Interés</th>
                <th className="num">Cuota</th>
                <th className="num">Punitorio</th>
                <th className="num">Adeudado</th>
                <th className="pl-3 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {l.installments.map((q) => {
                const st = installmentStatus(q, today);
                const copy = { ...q };
                if (q.due < today && st !== "pagada") liquidatePenalty(copy, l.tnaBps, today);
                const pen = unpaidPenalty(copy);
                const owed = unpaidCapital(q) + unpaidInterest(q) + pen;
                return (
                  <tr key={q.n} className={`border-t ${st === "vencida" ? "bg-mora-soft" : ""}`}>
                    <td className="py-1.5 tnum">{q.n}</td>
                    <td>
                      <D d={q.due} />
                    </td>
                    <td className="num">{formatARS(q.capital, false)}</td>
                    <td className="num">{formatARS(q.interest, false)}</td>
                    <td className="num font-semibold">{formatARS(q.capital + q.interest, false)}</td>
                    <td className="num">{pen || q.paidPenalty ? formatARS(pen || q.paidPenalty, false) : "—"}</td>
                    <td className="num">{owed ? formatARS(owed, false) : "—"}</td>
                    <td className="pl-3">
                      <Status s={st} />
                      {st === "vencida" && <span className="ml-1 text-xs text-mora tnum">{daysBetween(q.due, today)} d</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Pagos ({pays.length})</h2>
        {pays.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Sin pagos registrados.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1.5 text-left">Fecha</th>
                <th className="num">Monto</th>
                <th className="num">Saldo a favor usado</th>
                <th className="num">Saldo a favor después</th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-1.5">
                    <D d={p.date} />
                  </td>
                  <td className="num">{formatARS(p.amount, false)}</td>
                  <td className="num">{formatARS(p.creditUsed, false)}</td>
                  <td className="num">{formatARS(p.creditAfter, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
