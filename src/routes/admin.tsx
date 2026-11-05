import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatARS, formatBps } from "@/engine";
import { useStore } from "@/data/StoreProvider";
import { ADMIN_PASSWORD } from "@/data/config";
import type { Config } from "@/data/types";
import { AmountInput, Field, Notice, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls, pageHead } from "@/lib/meta";

export const Route = createFileRoute("/admin")({
  head: () => pageHead("Administración", "Parámetros de ejemplo configurables: tasas, encaje, topes, previsiones y cupos."),
  component: Admin,
});

function PctInput({ id, bps, onChange }: { id: string; bps: number; onChange: (b: number) => void }) {
  const [t, setT] = useState(String(bps / 100).replace(".", ","));
  useEffect(() => setT(String(bps / 100).replace(".", ",")), [bps]);
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        className={`${inputCls} pr-8 text-right tnum`}
        value={t}
        onChange={(e) => {
          setT(e.target.value);
          const v = Number(e.target.value.replace(",", "."));
          if (!Number.isNaN(v) && v >= 0 && v <= 1000) onChange(Math.round(v * 100));
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
    </div>
  );
}

function diff(a: any, b: any, path = ""): string[] {
  const out: string[] = [];
  for (const k of Object.keys(b)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof b[k] === "object" && b[k] !== null) out.push(...diff(a?.[k] ?? {}, b[k], p));
    else if (a?.[k] !== b[k]) out.push(p);
  }
  return out;
}

function pick(obj: any, paths: string[]) {
  const out: Record<string, unknown> = {};
  for (const p of paths) out[p] = p.split(".").reduce((o, k) => o?.[k], obj);
  return out;
}

function Admin() {
  const store = useStore();
  const s = store.state;
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Config>(() => structuredClone(s.config));
  useEffect(() => {
    if (sessionStorage.getItem("mc-admin") === "1") setOk(true);
  }, []);
  useEffect(() => setDraft(structuredClone(s.config)), [s.config]);

  if (!ok)
    return (
      <div className="mx-auto max-w-sm">
        <PageHeader title="Administración" subtitle="Acceso protegido por clave." />
        <form
          className="panel space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw === ADMIN_PASSWORD) {
              sessionStorage.setItem("mc-admin", "1");
              setOk(true);
            } else setErr("Clave incorrecta");
          }}
        >
          <Field label="Clave" htmlFor="pw">
            <Input id="pw" type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </Field>
          {err && <Notice tone="mora">{err}</Notice>}
          <Button type="submit" variant="action" size="xl" className="w-full">
            Ingresar
          </Button>
        </form>
      </div>
    );

  const set = (fn: (c: Config) => void) =>
    setDraft((d) => {
      const n = structuredClone(d);
      fn(n);
      return n;
    });
  const changed = diff(s.config, draft);

  const save = async () => {
    if (!changed.length) {
      toast("No hay cambios");
      return;
    }
    await store.dispatch({
      type: "UPDATE_CONFIG",
      entity: "Configuración",
      entityId: "parámetros",
      summary: `Cambió parámetros: ${changed.join(", ")}`,
      payload: { patch: pick(draft, changed.map((p) => p.split(".")[0])) },
      before: pick(s.config, changed),
      after: pick(draft, changed),
    });
    toast.success("Parámetros guardados. Solo afectan a préstamos nuevos.");
  };

  const reset = async () => {
    if (!confirm("Se borran todos los datos y eventos de este equipo y se vuelven a generar los datos de ejemplo. ¿Continuar?")) return;
    await store.reset();
    location.reload();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administración"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              sessionStorage.removeItem("mc-admin");
              setOk(false);
            }}
          >
            Salir
          </Button>
        }
      />
      <Notice tone="warn">Valores de ejemplo, no son normas ni valores reales del regulador. Los valida el contador de la mutual. Un cambio de tasa no modifica préstamos ya otorgados: solo los nuevos.</Notice>

      <section className="panel grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="text-lg font-bold sm:col-span-2 lg:col-span-3">Tasas, encaje y topes</h2>
        <Field label="TNA préstamos personales" htmlFor="tp">
          <PctInput id="tp" bps={draft.personalTnaBps} onChange={(b) => set((c) => (c.personalTnaBps = b))} />
        </Field>
        <Field label="TNA préstamos prendarios" htmlFor="tr">
          <PctInput id="tr" bps={draft.prendarioTnaBps} onChange={(b) => set((c) => (c.prendarioTnaBps = b))} />
        </Field>
        <Field label="Máximo prendario sobre tasación" htmlFor="ltv">
          <PctInput id="ltv" bps={draft.maxLtvBps} onChange={(b) => set((c) => (c.maxLtvBps = b))} />
        </Field>
        <Field label="Encaje sobre ahorros" htmlFor="enc">
          <PctInput id="enc" bps={draft.encajeBps} onChange={(b) => set((c) => (c.encajeBps = b))} />
        </Field>
        <Field label="Tope por asociado (sobre capacidad)" htmlFor="tope">
          <PctInput id="tope" bps={draft.topeBps} onChange={(b) => set((c) => (c.topeBps = b))} />
        </Field>
        <Field label="Condonación de punitorios al refinanciar" htmlFor="cond">
          <PctInput id="cond" bps={draft.condonationBps} onChange={(b) => set((c) => (c.condonationBps = b))} />
        </Field>
        <Field label="Capital propio afectado" htmlFor="own" hint={`Actual: ${formatARS(s.config.ownCapital)}`}>
          <AmountInput id="own" value={draft.ownCapital} onChange={(v) => v !== null && set((c) => (c.ownCapital = v))} />
        </Field>
      </section>

      <section className="panel grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="text-lg font-bold sm:col-span-2 lg:col-span-4">TNA pasivas (ahorro a término)</h2>
        {Object.keys(draft.passive).map((t) => (
          <Field key={t} label={`${t} días`} htmlFor={`pas${t}`}>
            <PctInput id={`pas${t}`} bps={draft.passive[t]} onChange={(b) => set((c) => (c.passive[t] = b))} />
          </Field>
        ))}
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Tabla de previsiones por categoría</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left">Tabla</th>
                {[1, 2, 3, 4, 5].map((c) => (
                  <th key={c} className="num">
                    Cat. {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["common", "preferred"] as const).map((t) => (
                <tr key={t} className="border-t">
                  <td className="py-2 pr-2">{t === "common" ? "Común" : "Prendaria (garantía preferida)"}</td>
                  {draft.provision[t].map((b, k) => (
                    <td key={k} className="px-1 py-2">
                      <PctInput id={`${t}${k}`} bps={b} onChange={(nb) => set((c) => (c.provision[t][k] = nb))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="text-lg font-bold sm:col-span-2 lg:col-span-3">Cupos diarios por sucursal</h2>
        {s.branches.map((b) => (
          <Field key={b.id} label={b.name} htmlFor={`q${b.id}`} hint={draft.dailyQuota[b.id] === 0 ? "Cupo en cero: el botón Aprobar queda deshabilitado" : undefined}>
            <AmountInput id={`q${b.id}`} value={draft.dailyQuota[b.id] ?? 0} onChange={(v) => v !== null && set((c) => (c.dailyQuota[b.id] = v))} />
          </Field>
        ))}
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background py-3">
        <Button variant="action" size="xl" onClick={save} disabled={!changed.length}>
          Guardar cambios{changed.length ? ` (${changed.length})` : ""}
        </Button>
        <Button variant="outline" size="xl" onClick={() => setDraft(structuredClone(s.config))} disabled={!changed.length}>
          Descartar
        </Button>
        <Button variant="mora" size="xl" className="ml-auto" onClick={reset}>
          Reiniciar datos de ejemplo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground tnum">
        Semilla actual: {s.seedRecords.toLocaleString("es-AR")} registros generados · tope vigente {formatBps(s.config.topeBps)}.
      </p>
    </div>
  );
}
