import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { capitalPending } from "@/engine";
import { useStore } from "@/data/StoreProvider";
import type { Associate } from "@/data/types";
import { Money, PageHeader, VirtualTable, type Column } from "@/components/common";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead, selectCls } from "@/lib/meta";

export const Route = createFileRoute("/asociados/")({
  head: () => pageHead("Asociados", "Padrón de asociados de Mutual CAT con saldo vigente por asociado."),
  component: Asociados,
});

type Row = Associate & { balance: number; loans: number };

function Asociados() {
  const store = useStore();
  const s = store.state;
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const all = useMemo<Row[]>(() => {
    const bal: Record<string, number> = {};
    const cnt: Record<string, number> = {};
    for (const l of Object.values(s.loans)) {
      if (l.status !== "vigente") continue;
      bal[l.associateId] = (bal[l.associateId] ?? 0) + capitalPending(l.installments);
      cnt[l.associateId] = (cnt[l.associateId] ?? 0) + 1;
    }
    return Object.values(s.associates)
      .map((a) => ({ ...a, balance: bal[a.id] ?? 0, loans: cnt[a.id] ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, store.version]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, "");
    return all.filter(
      (a) =>
        (!branch || a.branchId === branch) &&
        (!t || a.name.toLowerCase().includes(t) || (digits.length >= 2 && (a.dni.replace(/\./g, "").includes(digits) || String(a.number).includes(digits)))),
    );
  }, [all, q, branch]);
  const cols: Column<Row>[] = [
    { key: "name", header: "Asociado", width: "minmax(0,1fr)", render: (a) => <span className="font-medium">{a.name}</span> },
    { key: "num", header: "N.º", width: "70px", align: "right", hideOnMobile: true, render: (a) => a.number },
    { key: "dni", header: "DNI", width: "110px", align: "right", hideOnMobile: true, render: (a) => a.dni },
    { key: "suc", header: "Sucursal", width: "110px", hideOnMobile: true, render: (a) => s.branches.find((b) => b.id === a.branchId)?.city },
    { key: "cat", header: "Categoría", width: "100px", hideOnMobile: true, render: (a) => a.category },
    { key: "bal", header: "Saldo vigente", width: "130px", align: "right", render: (a) => <Money c={a.balance} /> },
  ];
  return (
    <div>
      <PageHeader title="Asociados" subtitle={`${rows.length.toLocaleString("es-AR")} de ${all.length.toLocaleString("es-AR")} asociados`} />
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
        <Input aria-label="Buscar" className={inputCls} placeholder="Buscar por apellido, DNI o N.º" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sucursal" className={selectCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {s.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.city}
            </option>
          ))}
        </select>
      </div>
      <VirtualTable rows={rows} columns={cols} rowKey={(a) => a.id} onRowClick={(a) => navigate({ to: "/asociados/$id", params: { id: a.id } })} />
    </div>
  );
}
