import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, useToday } from "@/data/StoreProvider";
import { messagesFromEvents, reminders, type SimMessage } from "@/data/notifications";
import { formatDateTime } from "@/data/selectors";
import { Notice, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/meta";

export const Route = createFileRoute("/enviados")({
  head: () => pageHead("Enviados (simulado)", "Comprobantes y avisos por correo y WhatsApp simulados: no se envía nada."),
  component: Enviados,
});

function Item({ m }: { m: SimMessage }) {
  return (
    <li className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{m.channel} · {m.kind} · {m.to}</span>
        <span className="tnum">{m.when.length > 10 ? formatDateTime(Date.parse(m.when)) : m.when.split("-").reverse().join("/")}</span>
      </div>
      <p className="mt-1 font-medium">{m.subject}</p>
      <p className="text-sm">{m.body}</p>
    </li>
  );
}

function Enviados() {
  const store = useStore();
  const today = useToday();
  const [tab, setTab] = useState<"enviados" | "pendientes">("enviados");
  const sent = useMemo(() => messagesFromEvents(store.state, store.events), [store.state, store.events, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = useMemo(() => reminders(store.state, today), [store.state, today, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = tab === "enviados" ? sent : due;
  return (
    <div className="space-y-4">
      <PageHeader title="Enviados (simulado)" subtitle={`${sent.length} comprobantes y avisos · ${due.length} recordatorios para hoy`} />
      <Notice>Simulación: no se manda ningún correo ni WhatsApp. Los mensajes se generan a partir de los cambios registrados y de las cuotas de los préstamos.</Notice>
      <div className="flex gap-2">
        <Button variant={tab === "enviados" ? "default" : "outline"} onClick={() => setTab("enviados")}>Comprobantes ({sent.length})</Button>
        <Button variant={tab === "pendientes" ? "default" : "outline"} onClick={() => setTab("pendientes")}>Recordatorios ({due.length})</Button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tab === "enviados" ? "Todavía no hay comprobantes. Registre un pago o apruebe un préstamo." : "No hay cuotas por vencer ni vencidas."}</p>
      ) : (
        <ul className="space-y-2">{list.slice(0, 300).map((m) => <Item key={m.id} m={m} />)}</ul>
      )}
      {list.length > 300 && <p className="text-xs text-muted-foreground">Se muestran los primeros 300 de {list.length}.</p>}
    </div>
  );
}
