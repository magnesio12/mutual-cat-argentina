import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatBps } from "@/engine";
import { useNetwork, useStore, useToday } from "@/data/StoreProvider";
import type { NetworkCalc } from "@/data/selectors";
import { CategoryBadge, Money, PageHeader, VirtualTable, type Column } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead, selectCls } from "@/lib/meta";

export const Route = createFileRoute("/mora")({
  head: () => pageHead("Mora y previsiones", "Categorías, días de atraso al corte y previsiones de toda la red de sucursales."),
  component: Mora,
});

type Row = NetworkCalc["rows"][number];
const CASE4 = ["P-101", "P-102", "R-201", "P-103", "P-104", "P-105"];

function Mora() {
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const navigate = useNavigate();
  const [cutoff, setCutoff] = useState(today);
  const [branch, setBranch] = useState("");
  const [cat, setCat] = useState("");
  const [onlyCase, setOnlyCase] = useState(false);
  const { data, busy } = useNetwork(s, cutoff, store.version);
  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows
      .filter((r) => (!branch || r.branchId === branch) && (!cat || r.category === Number(cat)) && (!onlyCase || CASE4.includes(r.code)))
      .sort((a, b) => b.days - a.days || b.provision - a.provision);
  }, [data, branch, cat, onlyCase]);
  const totals = rows.reduce((t, r) => ({ capital: t.capital + r.capital, provision: t.provision + r.provision }), { capital: 0, provision: 0 });
  const byCat = [1, 2, 3, 4, 5].map((c) => {
    const rs = rows.filter((r) => r.category === c);
    return { c, n: rs.length, capital: rs.reduce((t, r) => t + r.capital, 0), provision: rs.reduce((t, r) => t + r.provision, 0) };
  });
  const cols: Column<Row>[] = [
    { key: "c", header: "Préstamo", width: "90px", render: (r) => <span className="font-semibold text-primary">{r.code}</span> },
    { key: "a", header: "Asociado", width: "minmax(0,1fr)", hideOnMobile: true, render: (r) => s.associates[r.associateId]?.name },
    { key: "b", header: "Sucursal", width: "110px", hideOnMobile: true, render: (r) => s.branches.find((b) => b.id === r.branchId)?.city },
    { key: "d", header: "Días", width: "56px", align: "right", render: (r) => r.days },
    { key: "k", header: "Cat.", width: "48px", render: (r) => <CategoryBadge c={r.category} /> },
    { key: "cap", header: "Capital", width: "minmax(0,130px)", align: "right", hideOnMobile: true, render: (r) => <Money c={r.capital} /> },
    { key: "t", header: "Tasa", width: "60px", align: "right", hideOnMobile: true, render: (r) => formatBps(r.rateBps) },
    { key: "p", header: "Previsión", width: "minmax(0,130px)", align: "right", render: (r) => <Money c={r.provision} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Mora y previsiones"
        subtitle={data ? `Recalculado para toda la red en ${Math.round(data.ms)} ms en segundo plano${busy ? " · actualizando" : ""}` : "Calculando…"}
        actions={
          <Button
            variant={onlyCase ? "default" : "outline"}
            onClick={() => {
              setCutoff("2026-06-30");
              setBranch("");
              setCat("");
              setOnlyCase(!onlyCase);
            }}
          >
            {onlyCase ? "Ver toda la cartera" : "Ver caso de prueba 4 (corte 30/06/2026)"}
          </Button>
        }
      />
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-[200px_220px_200px]">
        <div className="col-span-2 md:col-span-1">
          <label htmlFor="corte" className="text-xs font-semibold">
            Fecha de corte
          </label>
          <Input id="corte" type="date" className={inputCls} value={cutoff} onChange={(e) => e.target.value && setCutoff(e.target.value)} />
        </div>
        <div>
          <label htmlFor="suc" className="text-xs font-semibold">
            Sucursal
          </label>
          <select id="suc" className={selectCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">Toda la red</option>
            {s.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.city}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cat" className="text-xs font-semibold">
            Categoría
          </label>
          <select id="cat" className={selectCls} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((c) => (
              <option key={c} value={c}>
                Categoría {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <section className="panel mb-3 overflow-x-auto p-3">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Categoría</th>
              <th className="text-left">Atraso</th>
              <th className="num">Préstamos</th>
              <th className="num">Capital</th>
              <th className="num">Previsión</th>
            </tr>
          </thead>
          <tbody>
            {byCat.map((r) => (
              <tr key={r.c} className="border-t">
                <td className="py-1.5">
                  <CategoryBadge c={r.c} />
                </td>
                <td className="text-muted-foreground">{["0 a 31 días", "32 a 90 días", "91 a 180 días", "181 a 365 días", "más de 365 días"][r.c - 1]}</td>
                <td className="num">{r.n.toLocaleString("es-AR")}</td>
                <td className="num">
                  <Money c={r.capital} />
                </td>
                <td className="num">
                  <Money c={r.provision} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 font-bold">
              <td className="py-2" colSpan={2}>
                Total
              </td>
              <td className="num">{rows.length.toLocaleString("es-AR")}</td>
              <td className="num">
                <Money c={totals.capital} />
              </td>
              <td className="num text-primary">
                <Money c={totals.provision} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">Tabla común {s.config.provision.common.map(formatBps).join(" · ")} — Tabla prendaria {s.config.provision.preferred.map(formatBps).join(" · ")}. Los refinanciados no mejoran su categoría salvo un nivel cada 3 cuotas seguidas en fecha.</p>
      </section>
      <VirtualTable rows={rows} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => navigate({ to: "/prestamos/$id", params: { id: r.id } })} height="calc(100vh - 220px)" />
    </div>
  );
}
