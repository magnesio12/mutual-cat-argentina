import { createFileRoute, Link } from "@tanstack/react-router";
import { formatARS, formatBps } from "@/engine";
import { useNetwork, useStore, useToday } from "@/data/StoreProvider";
import { capacityOf, dailyRemaining, topeOf } from "@/data/selectors";
import { D, Money, Notice } from "@/components/common";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";

export const Route = createFileRoute("/")({
  head: () => pageHead("Capacidad prestable", "Cuánto puede prestar hoy Mutual CAT, el tope por asociado y el cupo diario de la sucursal."),
  component: Inicio,
});

function Inicio() {
  const store = useStore();
  const s = store.state;
  const today = useToday();
  const cap = capacityOf(s);
  const tope = topeOf(s);
  const branchId = store.user?.branchId ?? "VT";
  const branch = s.branches.find((b) => b.id === branchId);
  const quota = s.config.dailyQuota[branchId] ?? 0;
  const remaining = dailyRemaining(s, branchId, today);
  const negative = cap.capacity < 0;
  const { data: net, busy } = useNetwork(s, today, store.version);
  const dueToday = Object.values(s.deposits)
    .filter((d) => d.status === "vigente" && d.maturity <= today)
    .sort((a, b) => b.capital - a.capital);
  const conflicts = Object.values(s.conflicts).filter((c) => c.status === "pendiente").length;

  return (
    <div className="space-y-4">
      <section className="panel p-4 sm:p-6" aria-labelledby="cap-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="cap-title" className="eyebrow !text-primary">
              Capacidad prestable de la red · hoy <D d={today} />
            </h1>
            <p className={`figure-xl mt-2 text-[1.85rem] min-[400px]:text-[2.2rem] sm:text-6xl ${negative ? "text-danger" : "text-primary"}`}>
              <Money c={cap.capacity} />
            </p>
          </div>
          <Button asChild variant="action" size="xl" className="w-full sm:w-auto">
            <Link to="/prestamos/nuevo">Nuevo préstamo</Link>
          </Button>
        </div>
        {negative && (
          <div className="mt-3">
            <Notice tone="danger">Capacidad prestable negativa: no se aprueban préstamos</Notice>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-secondary p-3">
            <p className="eyebrow">Tope por asociado ({formatBps(s.config.topeBps)})</p>
            <p className="figure-xl mt-1 text-base min-[400px]:text-lg sm:text-2xl">
              <Money c={tope} />
            </p>
          </div>
          <div className={`rounded-md p-3 ${remaining === 0 ? "bg-mora-soft" : "bg-secondary"}`}>
            <p className="eyebrow">Cupo diario · {branch?.city}</p>
            <p className={`figure-xl mt-1 text-base min-[400px]:text-lg sm:text-2xl ${remaining === 0 ? "text-mora" : ""}`}>
              <Money c={remaining} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground tnum">de {formatARS(quota)}</p>
          </div>
        </div>
      </section>

      <section className="panel p-4 sm:p-6" aria-labelledby="calc-title">
        <h2 id="calc-title" className="text-lg font-bold">
          Cómo se llega a ese número
        </h2>
        <dl className="mt-2 divide-y text-[15px]">
          <Row label="Ahorros a término vigentes" sign="+" c={cap.savings} />
          <Row label="Capital propio afectado" sign="+" c={cap.ownCapital} />
          <Row label={`Encaje ${formatBps(s.config.encajeBps)} de los ahorros`} sign="−" c={cap.encaje} />
          <Row label="Saldo de capital de la cartera vigente" sign="−" c={cap.portfolio} />
          <div className="flex items-baseline justify-between gap-3 pt-3">
            <dt className="font-bold">Capacidad prestable</dt>
            <dd className={`num text-lg font-extrabold ${negative ? "text-danger" : "text-primary"}`}>
              <Money c={cap.capacity} />
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="panel p-4" aria-labelledby="dep-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="dep-title" className="text-lg font-bold">
              Depósitos que vencen hoy o antes
            </h2>
            <Link to="/ahorros" search={{ filtro: "vencen" }} className="text-sm font-semibold text-primary underline">
              Ver todos
            </Link>
          </div>
          {dueToday.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No hay vencimientos pendientes.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {dueToday.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {d.code} · {s.associates[d.associateId]?.name}
                  </span>
                  <span className="num font-semibold">
                    <Money c={d.capital} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {dueToday.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Si se pagan sin renovar, la capacidad baja en el capital de cada depósito.</p>}
        </section>

        <section className="panel p-4" aria-labelledby="net-title">
          <h2 id="net-title" className="text-lg font-bold">
            Red de sucursales
          </h2>
          {!net ? (
            <p className="mt-2 text-sm text-muted-foreground">Calculando previsiones de toda la red…</p>
          ) : (
            <>
              <dl className="mt-2 divide-y text-sm">
                <Row label="Previsiones totales al día de hoy" c={net.total} />
                <Row label="Cartera en categoría 3 o peor" c={net.byCategory.slice(2).reduce((t, x) => t + x.capital, 0)} tone="mora" />
              </dl>
              <p className="mt-2 text-xs text-muted-foreground tnum">
                {net.rows.length.toLocaleString("es-AR")} préstamos vigentes recalculados en segundo plano en {Math.round(net.ms)} ms{busy ? " · actualizando" : ""}.
              </p>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/mora">Mora y previsiones</Link>
            </Button>
            <Button asChild variant={conflicts ? "mora" : "outline"} size="sm">
              <Link to="/conflictos">Conflictos{conflicts ? ` (${conflicts})` : ""}</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, c, sign, tone }: { label: string; c: number; sign?: string; tone?: "mora" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-muted-foreground">
        {sign && <span className="mr-1.5 inline-block w-3 font-bold text-foreground">{sign}</span>}
        {label}
      </dt>
      <dd className={`num font-semibold ${tone === "mora" ? "text-mora" : ""}`}>
        <Money c={c} />
      </dd>
    </div>
  );
}
