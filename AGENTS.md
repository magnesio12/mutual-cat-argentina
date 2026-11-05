<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- All money math lives in `src/engine` as pure TS on integer cents with explicit half-up rounding (rates in bps); UI and data layers never compute amounts themselves, so the engine stays testable and exact.
- All app data lives in IndexedDB: seed snapshot + immutable event log replayed by the deterministic `src/data/reducer.ts`; every data change must go through `store.dispatch` so undo, "estado al…" and tab sync keep working.
- Heavy network-wide recalcs and seed generation run in Web Workers (`src/data/*.worker.ts`).
- The app renders client-only (`ClientOnly` in `__root.tsx`) because all state comes from IndexedDB.
- tsconfig drops `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noPropertyAccessFromIndexSignature`: record-keyed entity maps make them pure noise.
- `npm test` runs Vitest with an 80 % coverage threshold on `src/engine`; keep the mandatory cases green.
- Simulated email/WhatsApp messages are derived on the fly from the event log and state (`src/data/notifications.ts`), never stored, so undo and "estado al…" stay consistent.
