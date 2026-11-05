import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addMonthsClamped,
  buildSchedule,
  evaluateLoan,
  formatARS,
  formatBps,
  installmentsFromSchedule,
  scheduleTotals,
  type LoanType,
} from "@/engine";
import { useStore, useToday } from "@/data/StoreProvider";
import { associateBalance, capacityOf, dailyRemaining, topeOf, worstCategory } from "@/data/selectors";
import type { Loan } from "@/data/types";
import { AmountInput, AssociatePicker, CategoryBadge, D, Field, KV, Money, Notice, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead, selectCls } from "@/lib/meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/prestamos/nuevo")({
  validateSearch: (s: Record<string, unknown>): { asociado?: string } => ({ asociado: typeof s.asociado === "string" ? s.asociado : undefined }),
  head: () => pageHead("Nuevo préstamo", "Otorgar un préstamo personal o prendario con la capacidad prestable recalculada al instante."),
  component: NuevoPrestamo,
});

function NuevoPrestamo() {
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [type, setType] = useState<LoanType>("personal");
  const [assocId, setAssocId] = useState<string | undefined>(search.asociado);
  const [amount, setAmount] = useState<number | null>(null);
  const [n, setN] = useState(12);
  const [firstDue, setFirstDue] = useState(addMonthsClamped(today, 1));
  const [appraisal, setAppraisal] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState("");
  const [busy, setBusy] = useState(false);

  const cfg = s.config;
  const tna = type === "personal" ? cfg.personalTnaBps : cfg.prendarioTnaBps;
  const system = type === "personal" ? "frances" : "aleman";
  const minN = type === "personal" ? cfg.personalMinN : cfg.prendarioMinN;
  const maxN = type === "personal" ? cfg.personalMaxN : cfg.prendarioMaxN;
  const nOk = Math.min(maxN, Math.max(minN, n));
  const branchId = store.user?.branchId ?? "VT";
  const cap = capacityOf(s).capacity;
  const tope = topeOf(s);
  const balance = assocId ? associateBalance(s, assocId) : 0;
  const worst = assocId ? worstCategory(s, assocId, today) : 1;
  const quotaLeft = dailyRemaining(s, branchId, today);
  const assoc = assocId ? s.associates[assocId] : undefined;

  const rows = useMemo(() => (amount && amount > 0 ? buildSchedule(system, amount, tna, nOk, firstDue) : []), [system, amount, tna, nOk, firstDue]);
  const totals = scheduleTotals(rows);
  const decision =
    assocId && amount
      ? evaluateLoan({
          type,
          amount,
          associateBalance: balance,
          capacity: cap,
          topeBps: cfg.topeBps,
          appraisal: type === "prendario" ? (appraisal ?? 0) : undefined,
          maxLtvBps: cfg.maxLtvBps,
          worstCategory: worst,
          dailyQuotaRemaining: quotaLeft,
        })
      : null;
  const quotaZero = quotaLeft <= 0;
  const missingPrend = type === "prendario" && (!appraisal || !vehicle.trim());
  const canApprove = !!decision?.ok && !quotaZero && !missingPrend && !busy;

  const approve = async () => {
    if (!assocId || !amount || !decision?.ok) return;
    setBusy(true);
    const id = `L${Date.now().toString(36).toUpperCase()}`;
    const code = `${type === "personal" ? "P" : "R"}-${Date.now().toString().slice(-6)}`;
    const loan: Loan = {
      id,
      code,
      associateId: assocId,
      branchId,
      type,
      system,
      principal: amount,
      tnaBps: tna,
      n: nOk,
      startDate: today,
      firstDue,
      appraisal: type === "prendario" ? (appraisal ?? undefined) : undefined,
      vehicle: type === "prendario" ? vehicle.trim() : undefined,
      installments: installmentsFromSchedule(rows),
      status: "vigente",
      credit: 0,
      approvedTs: Date.now(),
    };
    await store.dispatch({
      type: "APPROVE_LOAN",
      entity: "Préstamo",
      entityId: id,
      summary: `Aprobó ${type} ${code} por ${formatARS(amount)} a ${assoc?.name}`,
      payload: { loan },
      before: { capacidad: cap, tope, saldoAsociado: balance },
      after: { capacidad: cap - amount, saldoAsociado: balance + amount },
    });
    setBusy(false);
    const st = store.state.loans[id]?.status;
    if (st === "observada") toast.error("Aprobación observada: otra pestaña aprobó antes. Lo decide el gerente en Conflictos.");
    else toast.success(`Préstamo ${code} aprobado`);
    navigate({ to: "/prestamos/$id", params: { id } });
  };

  const reject = async () => {
    if (!assocId || !amount) return;
    const msg = decision && !decision.ok ? decision.message : "Rechazado por el oficial";
    await store.dispatch({
      type: "REJECT_LOAN",
      entity: "Solicitud",
      entityId: assocId,
      summary: `Rechazó ${type} por ${formatARS(amount)} a ${assoc?.name}: ${msg}`,
      payload: { associateId: assocId, amount, type, message: msg },
    });
    toast(`Solicitud rechazada: ${msg}`);
  };

  return (
    <div>
      <PageHeader title="Nuevo préstamo" subtitle={`Capacidad disponible ${formatARS(cap)} · tope por asociado ${formatARS(tope)}`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="panel space-y-4 p-4">
            <div role="radiogroup" aria-label="Tipo de préstamo" className="grid grid-cols-2 gap-2">
              {(["personal", "prendario"] as LoanType[]).map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => {
                    setType(t);
                    setN(t === "personal" ? 12 : 24);
                  }}
                  className={cn("rounded-md border-2 px-3 py-3 text-left", type === t ? "border-primary bg-ok-soft" : "border-border bg-card")}
                >
                  <span className="block font-display font-bold capitalize text-primary">{t}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t === "personal" ? `Francés · ${formatBps(cfg.personalTnaBps)} TNA · ${cfg.personalMinN} a ${cfg.personalMaxN} cuotas` : `Alemán · ${formatBps(cfg.prendarioTnaBps)} TNA · ${cfg.prendarioMinN} a ${cfg.prendarioMaxN} cuotas`}
                  </span>
                </button>
              ))}
            </div>
            <Field label="Asociado">
              <AssociatePicker state={s} value={assocId} onSelect={(a) => setAssocId(a.id)} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Monto pedido" htmlFor="monto">
                <AmountInput id="monto" value={amount} onChange={setAmount} />
              </Field>
              <Field label="Cuotas" htmlFor="cuotas">
                <select id="cuotas" className={selectCls} value={nOk} onChange={(e) => setN(Number(e.target.value))}>
                  {Array.from({ length: maxN - minN + 1 }, (_, k) => minN + k).map((k) => (
                    <option key={k} value={k}>
                      {k} cuotas
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Primer vencimiento" htmlFor="venc">
                <Input id="venc" type="date" className={inputCls} value={firstDue} onChange={(e) => e.target.value && setFirstDue(e.target.value)} />
              </Field>
            </div>
            {type === "prendario" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Tasación del vehículo" htmlFor="tasacion" hint={appraisal ? `Máximo a prestar (${formatBps(cfg.maxLtvBps)}): ${formatARS(Math.round((appraisal * cfg.maxLtvBps) / 10000))}` : "Hasta el 70 % de la tasación"}>
                  <AmountInput id="tasacion" value={appraisal} onChange={setAppraisal} />
                </Field>
                <Field label="Vehículo" htmlFor="vehiculo">
                  <Input id="vehiculo" className={inputCls} placeholder="Marca, modelo y año" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
                </Field>
              </div>
            )}
          </section>

          {rows.length > 0 && (
            <section className="panel p-4">
              <h2 className="text-lg font-bold">Cronograma simulado</h2>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded bg-secondary p-2">
                  <p className="eyebrow">Primera cuota</p>
                  <p className="font-bold tnum">
                    <Money c={rows[0].total} />
                  </p>
                </div>
                <div className="rounded bg-secondary p-2">
                  <p className="eyebrow">Intereses</p>
                  <p className="font-bold tnum">
                    <Money c={totals.interest} />
                  </p>
                </div>
                <div className="rounded bg-secondary p-2">
                  <p className="eyebrow">Total</p>
                  <p className="font-bold tnum">
                    <Money c={totals.total} />
                  </p>
                </div>
              </div>
              <div className="mt-3 max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-1.5 text-left">N.º</th>
                      <th className="text-left">Vence</th>
                      <th className="num hidden sm:table-cell">Capital</th>
                      <th className="num">Interés</th>
                      <th className="num">Cuota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.n} className="border-t">
                        <td className="py-1.5 tnum">{r.n}</td>
                        <td>
                          <D d={r.due} />
                        </td>
                        <td className="num hidden sm:table-cell">{formatARS(r.capital, false)}</td>
                        <td className="num">{formatARS(r.interest, false)}</td>
                        <td className="num font-semibold">{formatARS(r.total, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="panel p-4">
            <h2 className="text-lg font-bold">Evaluación</h2>
            {assoc ? (
              <div className="mt-1 divide-y">
                <KV k="Asociado" v={<Link className="text-primary underline" to="/asociados/$id" params={{ id: assoc.id }}>{assoc.name}</Link>} />
                <KV k="Saldo de capital vigente" v={<Money c={balance} />} />
                <KV k="Tope por asociado" v={<Money c={tope} />} />
                <KV k="Máximo disponible para este asociado" v={<Money c={Math.max(0, Math.min(tope - balance, cap))} />} strong />
                <KV k="Peor categoría" v={<CategoryBadge c={worst} />} />
                <KV k="Cupo diario restante de la sucursal" v={<Money c={quotaLeft} />} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Buscá un asociado para ver su saldo y su tope.</p>
            )}
            <div className="mt-3 space-y-2">
              {quotaZero && <Notice tone="mora">Cupo diario de la sucursal agotado: no se aprueban préstamos hoy</Notice>}
              {decision && !decision.ok && decision.code !== "cupo" && <Notice tone={decision.code === "capacidad_negativa" ? "danger" : "mora"}>{decision.message}</Notice>}
              {decision?.ok && !quotaZero && <Notice>Cumple tope, capacidad y cupo diario. Se puede aprobar.</Notice>}
              {decision?.ok && missingPrend && <Notice tone="warn">Completá la tasación y el vehículo.</Notice>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="action" size="xl" disabled={!canApprove} onClick={approve}>
                Aprobar
              </Button>
              <Button variant="outline" size="xl" disabled={!assocId || !amount} onClick={reject}>
                Rechazar
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
