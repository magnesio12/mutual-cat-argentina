import { createFileRoute, Link } from "@tanstack/react-router";
import { applyPayment, evaluateQueue, formatARS, frenchSchedule, germanSchedule, installmentsFromSchedule, provisionFor, provisionTotal, scheduleTotals, toCents } from "@/engine";
import { PageHeader } from "@/components/common";
import { pageHead } from "@/lib/meta";

export const Route = createFileRoute("/casos")({
  head: () => pageHead("Casos de prueba", "Verificación en vivo de los casos de prueba del motor de cálculo."),
  component: Casos,
});

function Check({ label, got, want }: { label: string; got: string; want: string }) {
  const ok = got === want;
  return (
    <tr className="border-t">
      <td className="py-1.5 pr-2">{label}</td>
      <td className="num">{got}</td>
      <td className={`pl-3 text-xs font-bold ${ok ? "text-primary" : "text-danger"}`}>{ok ? "Coincide" : `Esperado ${want}`}</td>
    </tr>
  );
}

function Block({ title, children, link }: { title: string; children: React.ReactNode; link?: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {link}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function Casos() {
  const $ = toCents;
  const f = (c: number) => formatARS(c);
  const g = germanSchedule($(4_800_000), 3800, 12, "2026-02-15");
  const gt = scheduleTotals(g);
  const q = evaluateQueue({ savings: $(50_000_000), ownCapital: $(30_000_000), encajeBps: 1500, portfolio: $(41_000_000) }, 800, [
    { id: "A", amount: $(2_000_000), associateBalance: $(520_000) },
    { id: "B", amount: $(2_400_000), associateBalance: 0 },
    { id: "C", amount: $(2_360_000), associateBalance: 0 },
    { id: "D", amount: $(2_021_200.01), associateBalance: $(150_000) },
  ]);
  const qs = installmentsFromSchedule(frenchSchedule($(900_000), 4500, 6, "2026-01-10"));
  const p1 = applyPayment(qs, 4500, "2026-01-10", $(170_290.98));
  const p2 = applyPayment(p1.installments, 4500, "2026-03-25", $(250_000));
  const p3 = applyPayment(p2.installments, 4500, "2026-04-10", $(300_000), p2.creditAfter);
  const p4 = applyPayment(p3.installments, 4500, "2026-05-10", $(137_221.76), p3.creditAfter);
  const prov = [
    provisionFor({ id: "P-101", type: "personal", capital: $(1_200_000), days: 0 }),
    provisionFor({ id: "P-102", type: "personal", capital: $(800_000), days: 61 }),
    provisionFor({ id: "R-201", type: "prendario", capital: $(2_500_000), days: 91 }),
    provisionFor({ id: "P-103", type: "personal", capital: $(640_000), days: 31 }),
    provisionFor({ id: "P-104", type: "personal", capital: $(410_000), days: 32 }),
    provisionFor({ id: "P-105", type: "personal", capital: $(980_000), days: 0, refiCategory: 3, streak: 2 }),
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Casos de prueba" subtitle="Calculados en vivo por el motor. Los mismos casos corren como tests automáticos." />
      <Block title="1. Prendario alemán 4.800.000 · 12 cuotas · 38 %" link={<Link to="/prestamos/$id" params={{ id: "LC1" }} className="text-sm font-semibold text-primary underline">Ver R-4800</Link>}>
        <Check label="Cuota 1 total" got={f(g[0].total)} want="$ 552.000,00" />
        <Check label="Cuota 2 total" got={f(g[1].total)} want="$ 539.333,33" />
        <Check label="Cuota 3 total" got={f(g[2].total)} want="$ 526.666,67" />
        <Check label="Cuota 12 total" got={f(g[11].total)} want="$ 412.666,67" />
        <Check label="Total de intereses" got={f(gt.interest)} want="$ 988.000,00" />
        <Check label="Total pagado" got={f(gt.total)} want="$ 5.788.000,00" />
      </Block>
      <Block title="2. Tope que baja con cada aprobación">
        {q.map((r) => (
          <Check key={r.id} label={`${r.id}: capacidad ${f(r.capacityBefore)} · tope ${f(r.tope)}`} got={r.ok ? "Aprobado" : r.message} want={{ A: "Aprobado", B: "Supera el tope por asociado: máximo disponible $ 2.360.000,00", C: "Aprobado", D: "Supera el tope por asociado: máximo disponible $ 2.021.200,00" }[r.id]!} />
        ))}
        <Check label="Capacidad después de C" got={f(q[2].capacityAfter)} want="$ 27.140.000,00" />
      </Block>
      <Block title="3. Pagos parciales sobre dos cuotas vencidas" link={<Link to="/prestamos/$id" params={{ id: "LC3" }} className="text-sm font-semibold text-primary underline">Ver P-900</Link>}>
        <Check label="Punitorio cuota 2 (43 días)" got={f(p2.allocations[0].penalty)} want="$ 3.754,99" />
        <Check label="Punitorio cuota 3 (15 días)" got={f(p2.allocations[1].penalty)} want="$ 1.359,00" />
        <Check label="Capital imputado a cuota 3" got={f(p2.allocations[1].capital)} want="$ 51.277,61" />
        <Check label="Queda capital cuota 3" got={f(p2.allocations[1].remainingCapital)} want="$ 95.695,95" />
        <Check label="Punitorio cuota 3 al 10/04 (16 días)" got={f(p3.allocations[0].penalty)} want="$ 943,85" />
        <Check label="Saldo a favor al 10/04" got={f(p3.creditAfter)} want="$ 33.069,22" />
        <Check label="Cuota 5 al 10/05" got={f(p4.allocations[0].remainingCapital)} want="$ 0,00" />
      </Block>
      <Block title="4. Previsiones al corte 30/06/2026" link={<Link to="/mora" className="text-sm font-semibold text-primary underline">Ver en Mora</Link>}>
        {prov.map((r, k) => (
          <Check key={r.id} label={`${r.id} · categoría ${r.category}`} got={f(r.provision)} want={["$ 12.000,00", "$ 40.000,00", "$ 300.000,00", "$ 6.400,00", "$ 20.500,00", "$ 245.000,00"][k]} />
        ))}
        <Check label="Total" got={f(provisionTotal(prov))} want="$ 623.900,00" />
      </Block>
    </div>
  );
}
