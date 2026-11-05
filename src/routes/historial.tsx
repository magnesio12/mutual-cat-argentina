import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatARS } from "@/engine";
import { useNetwork, useStore, useToday } from "@/data/StoreProvider";
import { capacityOf, formatDateTime, topeOf } from "@/data/selectors";
import type { AppEvent, State } from "@/data/types";
import { KV, Money, Notice, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead } from "@/lib/meta";

export const Route = createFileRoute("/historial")({
  head: () => pageHead("Historial de eventos", "Bitácora inmutable con deshacer, rehacer y vista del estado a una fecha y hora."),
  component: Historial,
});

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v !== "object") return String(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}: ${typeof x === "number" && /capacidad|saldo|tope|capital|interes|monto/i.test(k) ? formatARS(x) : JSON.stringify(x)}`)
    .join(" · ");
};

function Historial() {
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("23:59");
  const [view, setView] = useState<{ state: State; notice: string | null; applied: number; at: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const events = useMemo(() => [...store.events].reverse(), [store.events, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const undone = useMemo(() => {
    const set = new Set<string>();
    for (const e of store.events) {
      if (e.type === "UNDO") set.add(e.payload.targetId);
      if (e.type === "REDO") set.delete(e.payload.targetId);
    }
    return set;
  }, [store.events, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: net } = useNetwork(view?.state, view ? new Date(view.at).toISOString().slice(0, 10) : today, view?.at);

  const showAt = async () => {
    setLoading(true);
    const at = new Date(`${date}T${time}:59`).getTime();
    const r = await store.stateAt(at);
    setView({ ...r, at });
    setLoading(false);
  };
  const undoOne = async (e: AppEvent) => {
    const r = await store.undoEvent(e);
    r.ok ? toast.success("Evento deshecho") : toast.error(r.message);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Historial de eventos"
        subtitle={`${store.events.length} eventos · instantánea cada 500 eventos (${store.snapshotCount} guardadas)`}
        actions={
          <>
            <Button variant="outline" onClick={async () => { const r = await store.undo(); r.ok ? toast.success("Se deshizo el último cambio") : toast.error(r.message); }}>
              Deshacer
            </Button>
            <Button variant="outline" disabled={!store.redoStack.length} onClick={async () => { const r = await store.redo(); r.ok ? toast.success("Se rehízo") : toast.error(r.message); }}>
              Rehacer ({store.redoStack.length})
            </Button>
          </>
        }
      />
      <section className="panel p-4">
        <h2 className="text-lg font-bold">Estado al…</h2>
        <div className="mt-2 grid grid-cols-[1fr_120px] gap-2 sm:grid-cols-[200px_120px_auto]">
          <Input aria-label="Fecha" type="date" className={inputCls} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Input aria-label="Hora" type="time" className={inputCls} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
          <Button variant="default" className="col-span-2 h-11 sm:col-span-1" onClick={showAt} disabled={loading}>
            {loading ? "Reproduciendo…" : "Ver estado"}
          </Button>
        </div>
        {view && (
          <div className="mt-3 space-y-2">
            {view.notice && <Notice tone="warn">{view.notice}</Notice>}
            <p className="text-sm text-muted-foreground">
              Estado al {formatDateTime(view.at)} · {view.applied} eventos reproducidos desde la instantánea más cercana.
            </p>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <KV k="Capacidad prestable" v={<Money c={capacityOf(view.state).capacity} />} strong />
              <KV k="Tope por asociado" v={<Money c={topeOf(view.state)} />} />
              <KV k="Previsiones de la red" v={net ? <Money c={net.total} /> : "calculando…"} />
              <KV k="Préstamos vigentes" v={net ? net.rows.length.toLocaleString("es-AR") : "…"} />
            </div>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        {events.length === 0 && <p className="p-4 text-sm text-muted-foreground">Todavía no hay eventos. Cada aprobación, pago, depósito o cambio de configuración queda registrado acá.</p>}
        <ul className="divide-y">
          {events.map((e) => {
            const isUndone = undone.has(e.id);
            const meta = e.type === "UNDO" || e.type === "REDO";
            return (
              <li key={e.id} className={`p-3 text-sm ${isUndone ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-medium ${isUndone ? "line-through" : ""}`}>{e.summary}</p>
                    <p className="text-xs text-muted-foreground tnum">
                      {formatDateTime(e.ts)} · {e.userName} · {s.branches.find((b) => b.id === e.branchId)?.city} · {e.entity} {e.entityId}
                    </p>
                    {(e.before != null || e.after != null) && (
                      <p className="mt-1 text-xs tnum">
                        <span className="text-muted-foreground">Antes:</span> {fmtVal(e.before)} <span className="text-muted-foreground">→ Después:</span> {fmtVal(e.after)}
                      </p>
                    )}
                  </div>
                  {!meta && !isUndone && (
                    <Button size="sm" variant="outline" onClick={() => undoOne(e)}>
                      Deshacer
                    </Button>
                  )}
                  {isUndone && <span className="text-xs font-semibold text-mora">Deshecho</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
