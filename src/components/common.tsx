import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatARS, formatDate, parseARS, type Cents } from "@/engine";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { Associate, State } from "@/data/types";

export function Money({ c, className, symbol = true }: { c: Cents; className?: string; symbol?: boolean }) {
  return <span className={cn("tnum whitespace-nowrap", c < 0 && "text-danger", className)}>{formatARS(c, symbol)}</span>;
}

export const D = ({ d }: { d?: string | null }) => <span className="tnum whitespace-nowrap">{d ? formatDate(d) : "—"}</span>;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  vigente: "bg-ok-soft text-primary",
  cancelado: "bg-secondary text-muted-foreground",
  pagada: "bg-secondary text-muted-foreground",
  observada: "bg-mora text-mora-foreground",
  anulado: "bg-secondary text-muted-foreground line-through",
  refinanciado: "bg-highlight-soft text-foreground",
  vencida: "bg-mora-soft text-mora",
  parcial: "bg-highlight-soft text-foreground",
  "a vencer": "bg-card text-foreground border border-border",
  pendiente: "bg-mora text-mora-foreground",
  resuelto: "bg-secondary text-muted-foreground",
  pagado: "bg-secondary text-muted-foreground",
  precancelado: "bg-highlight-soft text-foreground",
};

export function Status({ s }: { s: string }) {
  return <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-semibold capitalize", STATUS_STYLES[s] ?? "bg-secondary")}>{s}</span>;
}

export function CategoryBadge({ c }: { c: number }) {
  return (
    <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs font-bold tnum", c >= 3 ? "bg-mora text-mora-foreground" : c === 2 ? "bg-highlight-soft text-foreground" : "bg-ok-soft text-primary")}>
      {c}
    </span>
  );
}

export function AmountInput({ value, onChange, id, placeholder = "0,00", className }: { value: Cents | null; onChange: (c: Cents | null) => void; id?: string; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value !== null ? formatARS(value, false) : "");
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value !== null ? formatARS(value, false) : "");
      last.current = value;
    }
  }, [value]);
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
      <Input
        id={id}
        inputMode="decimal"
        className="h-11 pl-7 text-right text-lg font-semibold tnum"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const c = parseARS(e.target.value);
          last.current = c;
          onChange(c);
        }}
        onBlur={() => value !== null && setText(formatARS(value, false))}
      />
    </div>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function KV({ k, v, strong, className }: { k: ReactNode; v: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", className)}>
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={cn("min-w-0 text-right tnum break-words", strong && "text-base font-bold text-foreground")}>{v}</span>
    </div>
  );
}

/** Buscador de asociados por nombre, DNI o número. */
export function AssociatePicker({ state, value, onSelect }: { state: State; value?: string; onSelect: (a: Associate) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => Object.values(state.associates), [state.associates]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const digits = t.replace(/\D/g, "");
    return list
      .filter((a) => a.name.toLowerCase().includes(t) || (digits.length >= 3 && (a.dni.replace(/\./g, "").includes(digits) || String(a.number).includes(digits))))
      .slice(0, 8);
  }, [q, list]);
  const selected = value ? state.associates[value] : undefined;
  return (
    <div className="space-y-2">
      <Input aria-label="Buscar asociado" className="h-11 text-base" placeholder="Apellido, DNI o N.º de asociado" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="panel divide-y overflow-hidden">
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-highlight-soft"
                onClick={() => {
                  onSelect(a);
                  setQ("");
                }}
              >
                <span className="min-w-0 truncate font-medium">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tnum">
                  N.º {a.number} · DNI {a.dni}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados para «{q}».</p>}
      {selected && (
        <p className="text-sm">
          Seleccionado: <strong>{selected.name}</strong> <span className="text-muted-foreground tnum">· N.º {selected.number}</span>
        </p>
      )}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  width: string;
  align?: "right" | "left";
  render: (row: T) => ReactNode;
  hideOnMobile?: boolean;
}

/** Tabla virtualizada: solo se dibujan las filas visibles. */
export function VirtualTable<T>({ rows, columns, onRowClick, height = "calc(100vh - 260px)", rowKey }: { rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; height?: string; rowKey: (r: T) => string }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 48, overscan: 12 });
  const grid = columns.map((c) => c.width).join(" ");
  const gridMobile = columns.filter((c) => !c.hideOnMobile).map((c) => c.width).join(" ");
  return (
    <div className="panel overflow-hidden">
      <style>{`.vt-grid{grid-template-columns:${gridMobile}}@media(min-width:768px){.vt-grid{grid-template-columns:${grid}}}`}</style>
      <div className="vt-grid grid gap-2 border-b bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {columns.map((c) => (
          <div key={c.key} className={cn(c.align === "right" && "text-right", c.hideOnMobile && "hidden md:block")}>
            {c.header}
          </div>
        ))}
      </div>
      <div ref={parentRef} style={{ height, minHeight: 280 }} className="overflow-auto" role="list" aria-label={`${rows.length} filas`}>
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((it) => {
            const r = rows[it.index];
            return (
              <div
                key={rowKey(r)}
                role="listitem"
                onClick={() => onRowClick?.(r)}
                className={cn("vt-grid absolute left-0 right-0 grid items-center gap-2 border-b px-3 text-sm", onRowClick && "cursor-pointer hover:bg-highlight-soft")}
                style={{ top: 0, height: it.size, transform: `translateY(${it.start}px)` }}
              >
                {columns.map((c) => (
                  <div key={c.key} className={cn("min-w-0 truncate", c.align === "right" && "num", c.hideOnMobile && "hidden md:block")}>
                    {c.render(r)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No hay registros con estos filtros.</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "mora" | "danger" | "warn"; children: ReactNode }) {
  const map = {
    info: "border-primary/30 bg-ok-soft text-primary",
    mora: "border-mora/40 bg-mora-soft text-mora",
    danger: "border-danger bg-danger-soft text-danger font-bold",
    warn: "border-highlight bg-highlight-soft text-foreground",
  };
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cn("rounded-md border px-3 py-2.5 text-sm", map[tone])}>
      {children}
    </div>
  );
}
