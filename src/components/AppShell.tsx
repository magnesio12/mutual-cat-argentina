import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, Undo2, Redo2, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, useStore } from "@/data/StoreProvider";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Inicio" },
  { to: "/prestamos/nuevo", label: "Nuevo préstamo" },
  { to: "/asociados", label: "Asociados" },
  { to: "/prestamos", label: "Préstamos" },
  { to: "/cobranza", label: "Cobranza" },
  { to: "/ahorros", label: "Ahorro a término" },
  { to: "/mora", label: "Mora y previsiones" },
  { to: "/refinanciacion", label: "Refinanciación" },
  { to: "/historial", label: "Historial" },
  { to: "/enviados", label: "Enviados (simulado)" },
  { to: "/conflictos", label: "Conflictos" },
  { to: "/casos", label: "Casos de prueba" },
  { to: "/admin", label: "Administración" },
] as const;

function NavLinks({ onNavigate, conflicts }: { onNavigate?: () => void; conflicts: number }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.to === "/" ? path === "/" : path === n.to || (path.startsWith(n.to + "/") && !(n.to === "/prestamos" && path === "/prestamos/nuevo"));
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center justify-between rounded px-3 py-2.5 text-[15px] font-medium text-sidebar-foreground hover:bg-sidebar-accent",
              active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
            )}
          >
            {n.label}
            {n.to === "/conflictos" && conflicts > 0 && <span className="rounded bg-mora px-1.5 text-xs font-bold text-mora-foreground tnum">{conflicts}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const [user, setUser] = useCurrentUser();
  const [open, setOpen] = useState(false);

  if (store.status !== "ready" || !store.state) {
    const p = store.progress;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel w-full max-w-md p-6">
          <h1 className="text-2xl font-extrabold">Mutual CAT</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sistema de ayuda económica</p>
          <p className="mt-6 text-sm font-semibold">{store.status === "seeding" ? "Preparando datos de ejemplo por primera vez" : "Abriendo datos guardados en este equipo"}</p>
          {p && (
            <>
              <Progress className="mt-3" value={p.phase === "Listo" ? 100 : Math.round((p.done / Math.max(1, p.total)) * 100)} />
              <p className="mt-2 text-xs text-muted-foreground tnum">
                {p.phase} · {p.done.toLocaleString("es-AR")} de {p.total.toLocaleString("es-AR")}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const branch = store.state.branches.find((b) => b.id === user.branchId);
  const conflicts = Object.values(store.state.conflicts).filter((c) => c.status === "pendiente").length;
  const synced = Date.now() - store.lastRemoteAt < 4000;
  const doUndo = async () => {
    const r = await store.undo();
    r.ok ? toast.success("Se deshizo el último cambio") : toast.error(r.message);
  };
  const doRedo = async () => {
    const r = await store.redo();
    r.ok ? toast.success("Se rehízo el cambio") : toast.error(r.message);
  };

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="hidden bg-sidebar p-3 md:block">
        <div className="sticky top-3">
          <Link to="/" className="mb-4 block px-3 py-2">
            <span className="block font-display text-xl font-extrabold text-sidebar-foreground">Mutual CAT</span>
            <span className="block text-xs text-sidebar-foreground/75">Sistema de ayuda económica</span>
          </Link>
          <NavLinks conflicts={conflicts} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b bg-primary text-primary-foreground">
          <div className="flex items-center gap-2 px-3 py-2 sm:px-5">
            <button className="rounded p-2 hover:bg-primary-strong md:hidden" aria-label="Abrir menú" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </button>
            <Link to="/" className="font-display text-lg font-extrabold md:hidden">
              Mutual CAT
            </Link>
            <div className="ml-auto flex items-center gap-1">
              {synced && <span className="hidden text-xs text-primary-foreground/80 sm:inline">Actualizado desde otra pestaña</span>}
              <button className="rounded p-2 hover:bg-primary-strong" aria-label="Deshacer" title="Deshacer" onClick={doUndo}>
                <Undo2 className="size-5" />
              </button>
              <button className="rounded p-2 hover:bg-primary-strong disabled:opacity-40" aria-label="Rehacer" title="Rehacer" disabled={store.redoStack.length === 0} onClick={doRedo}>
                <Redo2 className="size-5" />
              </button>
              <label className="sr-only" htmlFor="user-select">
                Usuario y sucursal
              </label>
              <select
                id="user-select"
                value={user.id}
                onChange={(e) => setUser(e.target.value)}
                className="max-w-[150px] truncate rounded border border-primary-foreground/30 bg-primary-strong px-2 py-1.5 text-sm text-primary-foreground sm:max-w-none"
              >
                {store.state.users.map((u) => {
                  const b = store.state.branches.find((x) => x.id === u.branchId);
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name} · {b?.city} ({u.role})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div className="border-t border-primary-foreground/15 px-3 py-1 text-xs text-primary-foreground/85 sm:px-5">
            {branch?.name} · {branch?.city} · {user.name}
          </div>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
            <div className="absolute inset-0 bg-foreground/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-sidebar p-3">
              <div className="mb-3 flex items-center justify-between px-3">
                <span className="font-display text-xl font-extrabold text-sidebar-foreground">Mutual CAT</span>
                <button aria-label="Cerrar menú" className="rounded p-2 text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setOpen(false)}>
                  <X className="size-5" />
                </button>
              </div>
              <NavLinks conflicts={conflicts} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <main className="mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-6">{children}</main>
        <footer className="px-5 pb-6 text-xs text-muted-foreground">Mutual CAT · Datos de ejemplo guardados solo en este equipo</footer>
      </div>
    </div>
  );
}
