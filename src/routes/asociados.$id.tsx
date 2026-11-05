import { createFileRoute, Link } from "@tanstack/react-router";
import { capitalPending, simpleInterest } from "@/engine";
import { useStore, useToday } from "@/data/StoreProvider";
import { associateBalance, associateCredit, associateLoans, loanProvision, topeOf, worstCategory } from "@/data/selectors";
import { CategoryBadge, D, KV, Money, PageHeader, Status } from "@/components/common";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";

export const Route = createFileRoute("/asociados/$id")({
  head: () => pageHead("Ficha del asociado", "Préstamos, ahorros, saldo a favor y categoría del asociado."),
  component: Ficha,
});

function Ficha() {
  const { id } = Route.useParams();
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const a = s.associates[id];
  if (!a) return <p>No se encontró el asociado.</p>;
  const loans = associateLoans(s, id).sort((x, y) => y.startDate.localeCompare(x.startDate));
  const deps = Object.values(s.deposits)
    .filter((d) => d.associateId === id)
    .sort((x, y) => y.start.localeCompare(x.start));
  const balance = associateBalance(s, id);
  const tope = topeOf(s);
  const worst = worstCategory(s, id, today);
  const credit = associateCredit(s, id);
  const savings = deps.filter((d) => d.status === "vigente").reduce((t, d) => t + d.capital, 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title={a.name}
        subtitle={`N.º ${a.number} · DNI ${a.dni} · ${a.occupation} · ${s.branches.find((b) => b.id === a.branchId)?.city}`}
        actions={
          <>
            <Button asChild variant="action">
              <Link to="/prestamos/nuevo" search={{ asociado: id }}>
                Nuevo préstamo
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/ahorros" search={{ asociado: id }}>
                Nuevo depósito
              </Link>
            </Button>
          </>
        }
      />
      <section className="panel grid grid-cols-1 gap-x-6 p-4 sm:grid-cols-2">
        <KV k="Categoría de asociado" v={a.category} />
        <KV k="Asociado desde" v={<D d={a.since} />} />
        <KV k="Saldo de capital vigente" v={<Money c={balance} />} strong />
        <KV k="Disponible hasta el tope" v={<Money c={Math.max(0, tope - balance)} />} />
        <KV k="Saldo a favor" v={<Money c={credit} />} />
        <KV k="Ahorros a término vigentes" v={<Money c={savings} />} />
        <KV k="Peor categoría de deuda (hoy)" v={<CategoryBadge c={worst} />} />
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Préstamos ({loans.length})</h2>
        {loans.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Sin préstamos.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left">Código</th>
                  <th className="text-left">Tipo</th>
                  <th className="text-left">Estado</th>
                  <th className="text-center">Cat.</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-2">
                      <Link className="font-semibold text-primary underline" to="/prestamos/$id" params={{ id: l.id }}>
                        {l.code}
                      </Link>
                    </td>
                    <td className="capitalize">{l.type}</td>
                    <td>
                      <Status s={l.status} />
                    </td>
                    <td className="text-center">{l.status === "vigente" ? <CategoryBadge c={loanProvision(s, l, today).category} /> : "—"}</td>
                    <td className="num">
                      <Money c={capitalPending(l.installments)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Ahorros a término ({deps.length})</h2>
        {deps.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Sin depósitos.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left">Código</th>
                  <th className="text-left">Vence</th>
                  <th className="text-left">Estado</th>
                  <th className="num">Capital</th>
                  <th className="num hidden sm:table-cell">Interés al vto.</th>
                </tr>
              </thead>
              <tbody>
                {deps.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="py-2">{d.code}</td>
                    <td>
                      <D d={d.maturity} />
                    </td>
                    <td>
                      <Status s={d.status} />
                    </td>
                    <td className="num">
                      <Money c={d.capital} />
                    </td>
                    <td className="num hidden sm:table-cell">
                      <Money c={d.interestPaid ?? simpleInterest(d.capital, d.tnaBps, d.termDays)} />
                    </td>
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
