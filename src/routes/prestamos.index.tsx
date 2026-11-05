import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { capitalPending } from "@/engine";
import { useStore } from "@/data/StoreProvider";
import type { Loan } from "@/data/types";
import { Money, PageHeader, Status, VirtualTable, type Column } from "@/components/common";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead, selectCls } from "@/lib/meta";

export const Route = createFileRoute("/prestamos/")({
  head: () => pageHead("Cartera de préstamos", "Cartera de préstamos personales y prendarios de toda la red."),
  component: Prestamos,
});

type Row = Loan & { pending: number; assocName: string };

function Prestamos() {
  const store = useStore();
  const s = store.state;
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("vigente");
  const [type, setType] = useState("");
  const [branch, setBranch] = useState("");
  const all = useMemo<Row[]>(
    () =>
      Object.values(s.loans)
        .map((l) => ({ ...l, pending: capitalPending(l.installments), assocName: s.associates[l.associateId]?.name ?? "" }))
        .sort((a, b) => (a.sample ? -1 : 0) - (b.sample ? -1 : 0) || b.startDate.localeCompare(a.startDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, store.version],
  );
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((l) => (!status || l.status === status) && (!type || l.type === type) && (!branch || l.branchId === branch) && (!t || l.code.toLowerCase().includes(t) || l.assocName.toLowerCase().includes(t)));
  }, [all, q, status, type, branch]);
  const total = rows.reduce((t, r) => t + r.pending, 0);
  const cols: Column<Row>[] = [
    { key: "code", header: "Código", width: "90px", render: (l) => <span className="font-semibold text-primary">{l.code}</span> },
    { key: "a", header: "Asociado", width: "minmax(0,1fr)", render: (l) => l.assocName },
    { key: "t", header: "Tipo", width: "90px", hideOnMobile: true, render: (l) => <span className="capitalize">{l.type}</span> },
    { key: "s", header: "Estado", width: "110px", hideOnMobile: true, render: (l) => <Status s={l.status} /> },
    { key: "b", header: "Sucursal", width: "110px", hideOnMobile: true, render: (l) => s.branches.find((b) => b.id === l.branchId)?.city },
    { key: "p", header: "Otorgado", width: "130px", align: "right", hideOnMobile: true, render: (l) => <Money c={l.principal} /> },
    { key: "c", header: "Saldo capital", width: "125px", align: "right", render: (l) => <Money c={l.pending} /> },
  ];
  return (
    <div>
      <PageHeader title="Préstamos" subtitle={<span className="tnum">{rows.length.toLocaleString("es-AR")} préstamos · saldo de capital <Money c={total} /></span>} />
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-[1fr_160px_160px_180px]">
        <Input aria-label="Buscar" className={`${inputCls} col-span-2 md:col-span-1`} placeholder="Código o asociado" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Estado" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {["vigente", "observada", "cancelado", "refinanciado", "anulado"].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select aria-label="Tipo" className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="personal">Personal</option>
          <option value="prendario">Prendario</option>
        </select>
        <select aria-label="Sucursal" className={`${selectCls} col-span-2 md:col-span-1`} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {s.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.city}
            </option>
          ))}
        </select>
      </div>
      <VirtualTable rows={rows} columns={cols} rowKey={(l) => l.id} onRowClick={(l) => navigate({ to: "/prestamos/$id", params: { id: l.id } })} />
    </div>
  );
}
