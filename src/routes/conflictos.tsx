import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatARS } from "@/engine";
import { useStore } from "@/data/StoreProvider";
import { formatDateTime } from "@/data/selectors";
import type { Conflict, Loan } from "@/data/types";
import { KV, Money, Notice, PageHeader, Status } from "@/components/common";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";

export const Route = createFileRoute("/conflictos")({
  head: () => pageHead("Conflictos", "Aprobaciones observadas entre pestañas para que el gerente decida cuál se mantiene."),
  component: Conflictos,
});

function Conflictos() {
  const store = useStore();
  const s = store.state;
  const isManager = store.user?.role === "gerente";
  const list = Object.values(s.conflicts).sort((a, b) => b.ts - a.ts);

  const decide = async (c: Conflict, keep: Loan, drop: Loan | undefined) => {
    await store.dispatch({
      type: "RESOLVE_CONFLICT",
      entity: "Conflicto",
      entityId: c.id,
      summary: `Resolvió conflicto: mantiene ${keep.code}${drop ? ` y anula ${drop.code}` : ""}`,
      payload: { conflictId: c.id, keepLoanId: keep.id, dropLoanId: drop?.id, decision: `Se mantiene ${keep.code}` },
      before: { estado: "pendiente" },
      after: { estado: "resuelto", mantiene: keep.code },
    });
    toast.success(`Se mantiene ${keep.code}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Conflictos" subtitle="Cuando dos pestañas aprueban préstamos que juntos superan el tope o la capacidad, se mantiene el más temprano y el otro queda observado sin desembolsar." />
      {!isManager && <Notice tone="warn">Solo un usuario gerente puede decidir. Cambiá de usuario arriba (por ejemplo, Graciela Pereyra).</Notice>}
      {list.length === 0 && (
        <section className="panel p-4 text-sm">
          <p className="font-semibold">No hay aprobaciones observadas.</p>
          <p className="mt-1 text-muted-foreground">Para probarlo: abrí la app en dos pestañas, elegí el mismo asociado en «Nuevo préstamo» con montos que juntos superen su tope y aprobá en las dos casi a la vez.</p>
        </section>
      )}
      {list.map((c) => {
        const kept = s.loans[c.keptLoanId];
        const obs = s.loans[c.observedLoanId];
        return (
          <section key={c.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Aprobación observada</h2>
              <Status s={c.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {c.reason} · {formatDateTime(c.ts)}
              {c.decision && ` · Decisión: ${c.decision}`}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {[kept, obs].map((l, k) =>
                l ? (
                  <div key={l.id} className={`rounded-md border p-3 ${k === 1 ? "border-mora" : ""}`}>
                    <p className="eyebrow">{k === 0 ? "Aprobado primero" : "Observado (sin desembolsar)"}</p>
                    <Link to="/prestamos/$id" params={{ id: l.id }} className="font-display text-lg font-bold text-primary underline">
                      {l.code}
                    </Link>
                    <div className="divide-y">
                      <KV k="Asociado" v={s.associates[l.associateId]?.name} />
                      <KV k="Monto" v={<Money c={l.principal} />} strong />
                      <KV k="Aprobado" v={formatDateTime(l.approvedTs)} />
                      <KV k="Estado" v={<Status s={l.status} />} />
                    </div>
                    {c.status === "pendiente" && (
                      <Button className="mt-2 w-full" variant={k === 0 ? "default" : "action"} disabled={!isManager} onClick={() => decide(c, l, k === 0 ? obs : kept)}>
                        Mantener {l.code} ({formatARS(l.principal)})
                      </Button>
                    )}
                  </div>
                ) : (
                  <div key={k} className="rounded-md border p-3 text-sm text-muted-foreground">
                    Préstamo no disponible
                  </div>
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
