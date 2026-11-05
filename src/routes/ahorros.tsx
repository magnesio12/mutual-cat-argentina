import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { daysBetween, formatARS, formatBps, maturityDate, precancel, simpleInterest } from "@/engine";
import { useStore, useToday } from "@/data/StoreProvider";
import type { Deposit } from "@/data/types";
import { capacityOf } from "@/data/selectors";
import { AmountInput, AssociatePicker, D, Field, KV, Money, Notice, PageHeader, Status, VirtualTable, type Column } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead, selectCls } from "@/lib/meta";

export const Route = createFileRoute("/ahorros")({
  validateSearch: (s: Record<string, unknown>): { filtro?: string; asociado?: string } => ({
    filtro: typeof s.filtro === "string" ? s.filtro : undefined,
    asociado: typeof s.asociado === "string" ? s.asociado : undefined,
  }),
  head: () => pageHead("Ahorro a término", "Alta de depósitos a término, vencimientos y precancelación."),
  component: Ahorros,
});

function Ahorros() {
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const search = Route.useSearch();
  const [filter, setFilter] = useState(search.filtro ?? "vigente");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [assocId, setAssocId] = useState<string | undefined>(search.asociado);
  const [capital, setCapital] = useState<number | null>(null);
  const [term, setTerm] = useState("30");
  const [start, setStart] = useState(today);
  const [preDate, setPreDate] = useState(today);

  const all = useMemo(() => Object.values(s.deposits).sort((a, b) => a.maturity.localeCompare(b.maturity)), [s, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((d) => {
      if (filter === "vencen" && !(d.status === "vigente" && d.maturity <= today)) return false;
      if (filter !== "vencen" && filter && d.status !== filter) return false;
      return !t || d.code.toLowerCase().includes(t) || (s.associates[d.associateId]?.name ?? "").toLowerCase().includes(t);
    });
  }, [all, filter, q, today, s.associates]);
  const sel = selId ? s.deposits[selId] : null;
  const rate = s.config.passive[term] ?? 0;
  const pre = sel && sel.status === "vigente" ? precancel(sel.capital, sel.tnaBps, sel.start, preDate) : null;
  const cap = capacityOf(s).capacity;

  const create = async () => {
    if (!assocId || !capital) return;
    const id = `D${Date.now().toString(36).toUpperCase()}`;
    const dep: Deposit = {
      id,
      code: `PF-${Date.now().toString().slice(-6)}`,
      associateId: assocId,
      branchId: store.user?.branchId ?? "VT",
      capital,
      termDays: Number(term),
      tnaBps: rate,
      start,
      maturity: maturityDate(start, Number(term)),
      status: "vigente",
    };
    await store.dispatch({
      type: "CREATE_DEPOSIT",
      entity: "Depósito",
      entityId: id,
      summary: `Alta de depósito ${dep.code} por ${formatARS(capital)} a ${term} días para ${s.associates[assocId]?.name}`,
      payload: { deposit: dep },
      before: { capacidad: cap },
      after: { capacidad: cap + capital - Math.round((capital * s.config.encajeBps) / 10000) },
    });
    toast.success(`Depósito ${dep.code} dado de alta`);
    setCapital(null);
    setSelId(id);
  };

  const doPrecancel = async () => {
    if (!sel || !pre) return;
    if (!pre.ok) {
      toast.error(pre.message);
      return;
    }
    await store.dispatch({
      type: "PRECANCEL_DEPOSIT",
      entity: "Depósito",
      entityId: sel.id,
      summary: `Precanceló ${sel.code}: paga ${formatARS(pre.total)} (${pre.days} días al 50 % de la tasa)`,
      payload: { depositId: sel.id, date: preDate },
      before: { estado: "vigente" },
      after: { estado: "precancelado", interes: pre.interest },
    });
    toast.success("Depósito precancelado");
  };

  const mature = async (renew: boolean) => {
    if (!sel) return;
    const newDeposit: Deposit | undefined = renew
      ? {
          ...sel,
          id: `D${Date.now().toString(36).toUpperCase()}`,
          code: `PF-${Date.now().toString().slice(-6)}`,
          start: sel.maturity,
          maturity: maturityDate(sel.maturity, sel.termDays),
          tnaBps: s.config.passive[String(sel.termDays)] ?? sel.tnaBps,
          status: "vigente",
        }
      : undefined;
    await store.dispatch({
      type: "MATURE_DEPOSIT",
      entity: "Depósito",
      entityId: sel.id,
      summary: renew ? `Renovó ${sel.code} por ${sel.termDays} días` : `Pagó al vencimiento ${sel.code} sin renovar (${formatARS(sel.capital)} + intereses)`,
      payload: { depositId: sel.id, date: today, renew, newDeposit },
      before: { capacidad: cap },
      after: { capacidad: renew ? cap : cap - sel.capital + Math.round((sel.capital * s.config.encajeBps) / 10000) },
    });
    toast.success(renew ? "Depósito renovado" : "Depósito pagado sin renovación: la capacidad bajó");
  };

  const cols: Column<Deposit>[] = [
    { key: "c", header: "Código", width: "90px", hideOnMobile: true, render: (d) => <span className="font-semibold text-primary">{d.code}</span> },
    { key: "a", header: "Asociado", width: "minmax(0,1fr)", render: (d) => s.associates[d.associateId]?.name },
    { key: "p", header: "Plazo", width: "70px", align: "right", hideOnMobile: true, render: (d) => `${d.termDays} d` },
    { key: "v", header: "Vence", width: "100px", render: (d) => <span className={d.status === "vigente" && d.maturity <= today ? "font-bold text-mora" : ""}><D d={d.maturity} /></span> },
    { key: "s", header: "Estado", width: "110px", hideOnMobile: true, render: (d) => <Status s={d.status} /> },
    { key: "k", header: "Capital", width: "125px", align: "right", render: (d) => <Money c={d.capital} /> },
  ];

  return (
    <div>
      <PageHeader title="Ahorro a término" subtitle="Interés simple al vencimiento. Precancelación desde los 30 días al 50 % de la tasa pactada." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
            <Input aria-label="Buscar" className={inputCls} placeholder="Código o asociado" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Filtro" className={selectCls} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="vigente">Vigentes</option>
              <option value="vencen">Vencidos sin pagar</option>
              <option value="pagado">Pagados</option>
              <option value="precancelado">Precancelados</option>
              <option value="">Todos</option>
            </select>
          </div>
          <VirtualTable rows={rows} columns={cols} rowKey={(d) => d.id} onRowClick={(d) => setSelId(d.id)} height="calc(100vh - 300px)" />
        </div>
        <aside className="space-y-4">
          {sel && (
            <section className="panel p-4">
              <h2 className="text-lg font-bold">Depósito {sel.code}</h2>
              <div className="divide-y">
                <KV k="Asociado" v={s.associates[sel.associateId]?.name} />
                <KV k="Capital" v={<Money c={sel.capital} />} strong />
                <KV k="Plazo y tasa" v={`${sel.termDays} días · ${formatBps(sel.tnaBps)}`} />
                <KV k="Constituido" v={<D d={sel.start} />} />
                <KV k="Vence" v={<D d={sel.maturity} />} />
                <KV k="Interés al vencimiento" v={<Money c={simpleInterest(sel.capital, sel.tnaBps, sel.termDays)} />} />
                <KV k="Estado" v={<Status s={sel.status} />} />
                {sel.interestPaid !== undefined && <KV k="Interés pagado" v={<Money c={sel.interestPaid} />} />}
              </div>
              {sel.status === "vigente" && sel.maturity <= today && (
                <div className="mt-3 space-y-2">
                  <Notice tone="warn">Venció. Si no se renueva, la capacidad prestable baja {formatARS(sel.capital)} menos el encaje liberado.</Notice>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="action" onClick={() => mature(true)}>
                      Renovar
                    </Button>
                    <Button variant="mora" onClick={() => mature(false)}>
                      Pagar sin renovar
                    </Button>
                  </div>
                </div>
              )}
              {sel.status === "vigente" && sel.maturity > today && pre && (
                <div className="mt-3 space-y-2">
                  <Field label="Fecha de precancelación" htmlFor="pre">
                    <Input id="pre" type="date" className={inputCls} value={preDate} onChange={(e) => e.target.value && setPreDate(e.target.value)} />
                  </Field>
                  <p className="text-sm tnum">Días transcurridos: {daysBetween(sel.start, preDate)}</p>
                  {pre.ok ? <Notice>Paga {formatARS(pre.total)} (interés {formatARS(pre.interest)} al 50 % de la tasa)</Notice> : <Notice tone="mora">{pre.message}</Notice>}
                  <Button variant="outline" className="w-full" disabled={!pre.ok} onClick={doPrecancel}>
                    Precancelar
                  </Button>
                </div>
              )}
            </section>
          )}
          <section className="panel space-y-3 p-4">
            <h2 className="text-lg font-bold">Alta de depósito</h2>
            <Field label="Asociado">
              <AssociatePicker state={s} value={assocId} onSelect={(a) => setAssocId(a.id)} />
            </Field>
            <Field label="Capital" htmlFor="cap">
              <AmountInput id="cap" value={capital} onChange={setCapital} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Plazo" htmlFor="plazo">
                <select id="plazo" className={selectCls} value={term} onChange={(e) => setTerm(e.target.value)}>
                  {Object.keys(s.config.passive).map((t) => (
                    <option key={t} value={t}>
                      {t} días · {formatBps(s.config.passive[t])}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Desde" htmlFor="desde">
                <Input id="desde" type="date" className={inputCls} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
              </Field>
            </div>
            {capital ? (
              <p className="text-sm tnum">
                Vence el <D d={maturityDate(start, Number(term))} /> · interés {formatARS(simpleInterest(capital, rate, Number(term)))}
              </p>
            ) : null}
            <Button variant="action" size="xl" className="w-full" disabled={!assocId || !capital} onClick={create}>
              Dar de alta
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
