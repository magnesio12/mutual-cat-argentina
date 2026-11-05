import { useMemo, useState } from "react";
import { capitalPending } from "@/engine";
import type { Loan, State } from "@/data/types";
import { Input } from "@/components/ui/input";
import { Money } from "./common";
import { inputCls } from "@/lib/meta";

/** Buscador de préstamos vigentes por código o asociado. */
export function LoanPicker({ state, value, onSelect, filter }: { state: State; value?: string; onSelect: (l: Loan) => void; filter?: (l: Loan) => boolean }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return Object.values(state.loans)
      .filter((l) => l.status === "vigente" && (!filter || filter(l)))
      .filter((l) => l.code.toLowerCase().includes(t) || (state.associates[l.associateId]?.name ?? "").toLowerCase().includes(t))
      .slice(0, 8);
  }, [q, state, filter]);
  const sel = value ? state.loans[value] : undefined;
  return (
    <div className="space-y-2">
      <Input aria-label="Buscar préstamo" className={inputCls} placeholder="Código (ej. P-900) o apellido" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="panel divide-y overflow-hidden">
          {results.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-highlight-soft"
                onClick={() => {
                  onSelect(l);
                  setQ("");
                }}
              >
                <span className="min-w-0 truncate">
                  <strong className="text-primary">{l.code}</strong> · {state.associates[l.associateId]?.name}
                </span>
                <span className="shrink-0 text-xs tnum text-muted-foreground">
                  <Money c={capitalPending(l.installments)} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground">No hay préstamos vigentes que coincidan.</p>}
      {sel && (
        <p className="text-sm">
          Préstamo: <strong>{sel.code}</strong> · {state.associates[sel.associateId]?.name}
        </p>
      )}
    </div>
  );
}
