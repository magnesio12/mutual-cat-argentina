# Sistema de ayuda económica de Mutual CAT

App web sin servidor para una mutual del sur santafesino. Responde al instante si hay capacidad prestable, cuánto le queda a cada asociado hasta el tope, cobra cuotas con imputación exacta y muestra mora y previsiones de toda la red. Desarrollo: **KODARVIA**.

> Todos los nombres, cifras y registros son **inventados**. Ningún dato es real.

## Cómo correrlo

```bash
bun install        # o npm install
bun run dev        # o npm run dev  → http://localhost:8080
```

La primera vez se generan los datos de ejemplo (unos 36.000 registros) en un Web Worker, con barra de progreso. Quedan guardados en IndexedDB del navegador y sobreviven a la recarga.

## Tests

```bash
npm test
```

Corre Vitest con cobertura sobre el motor (`src/engine`). El umbral es 80 % en líneas, funciones, ramas y sentencias: si baja, el comando falla. Incluye los 4 casos de prueba obligatorios y los 14 casos borde (`src/engine/engine.test.ts`), más pruebas de la semilla, la bitácora, deshacer/rehacer, «estado al…» y conflictos (`src/data/data.test.ts`).

## Qué es dato de ejemplo y qué está simulado

| Elemento | Situación |
|---|---|
| Asociados, préstamos, cuotas, pagos, depósitos | Generados con PRNG mulberry32 y semilla fija (`SEED` en `src/data/config.ts`). Siempre salen iguales. |
| Casos de prueba | Cargados como ejemplos reconocibles: R-4800 (caso 1), P-900 (caso 3), P-101 a P-105 y R-201 (caso 4). La pantalla «Casos de prueba» los recalcula en vivo. |
| Usuarios y sucursales | Simulados (`USERS`, `BRANCHES`). Se elige con el selector del encabezado; cada evento registra quién lo hizo. |
| Valores de /admin | Valores de ejemplo: no son normas ni valores reales del regulador. Los valida el contador de la mutual. |
| Correo, WhatsApp, pagos electrónicos | No se conectan. No hay envíos reales. |
| Fecha de los datos | La semilla está generada hasta el `SEED_REF` (05/11/2026). La app usa la fecha real del equipo. |
| Sucursal Villa Cañás | Cupo diario de ejemplo en cero, para mostrar el botón «Aprobar» deshabilitado. |

## Reiniciar los datos de ejemplo

En **/admin** → «Reiniciar datos de ejemplo». Borra IndexedDB (semilla, instantáneas y eventos) en este navegador, avisa a las otras pestañas y vuelve a generar todo.

## Clave del panel /admin

Por defecto: `mutualcat2026`. Para cambiarla, creá un archivo `.env` con:

```
VITE_ADMIN_PASSWORD=otra-clave
```

o editá `ADMIN_PASSWORD` en `src/data/config.ts`. Es una protección de interfaz; sin servidor no hay seguridad real.

## Estructura del proyecto

```
src/engine/        Motor de cálculo puro (sin React ni IndexedDB). Centavos enteros + half-up explícito.
  money.ts         Aritmética en centavos, formato $ 1.234.567,89
  dates.ts         Fechas ISO, vencimientos con día 31, dd/mm/aaaa
  schedule.ts      Sistemas francés y alemán
  loan.ts          Punitorios, imputación de pagos, días de atraso, racha en fecha
  capacity.ts      Capacidad prestable, tope por asociado, evaluación y cola de solicitudes
  provisions.ts    Categorías y previsiones (tabla común y prendaria)
  deposits.ts      Ahorro a término y precancelación
  refinance.ts     Simulación de refinanciación con condonación
  events.ts        Utilidades puras de bitácora (deshacer, estado al…)
src/data/          Capa de datos
  idb.ts           IndexedDB (almacenes kv y events)
  seed.ts          Generador determinista de la semilla
  seed.worker.ts   Genera la semilla en segundo plano con progreso
  calc.worker.ts   Recalcula capacidad y previsiones de toda la red en un Web Worker
  reducer.ts       Aplica cada evento al estado (determinista, usado en vivo y al reproducir)
  store.ts         Bitácora inmutable, instantánea cada 500 eventos, deshacer/rehacer, BroadcastChannel
  selectors.ts     Consultas sobre el estado
src/routes/        Pantallas (TanStack Router)
src/components/    Encabezado, navegación, tablas virtualizadas y piezas comunes
```

### Eventos, deshacer y sincronización

- Cada cambio es un evento inmutable con usuario, sucursal, fecha y hora, entidad, valor anterior y nuevo.
- Deshacer/rehacer agrega eventos `UNDO`/`REDO`; el estado se reproduce desde la instantánea más cercana. Sin límite de pasos.
- «Estado al…» reproduce los eventos hasta la fecha y hora elegida.
- Las pestañas se sincronizan por BroadcastChannel. Si dos aprobaciones juntas superan el tope o la capacidad, queda la de marca de tiempo más temprana y la otra pasa a «aprobación observada» sin desembolsar; el gerente decide en «Conflictos» y la decisión queda en el historial.

## A futuro

KODARVIA integrará el backend, las políticas de acceso y el despliegue. Esta versión guarda todo en el navegador.
