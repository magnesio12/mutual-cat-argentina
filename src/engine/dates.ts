/** Fechas como cadenas ISO "AAAA-MM-DD" (sin zona horaria). */
export type ISODate = string;

export function parseISO(d: ISODate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

export function iso(y: number, m: number, day: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUTC(d: ISODate): number {
  const { y, m, day } = parseISO(d);
  return Date.UTC(y, m - 1, day);
}

/** Días corridos de a hasta b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(toUTC(d) + n * 86400000);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Vencimiento k (0 = primero) manteniendo el día original del primer vencimiento.
 * Si el mes no tiene ese día, vence el último día del mes.
 */
export function addMonthsClamped(first: ISODate, k: number): ISODate {
  const { y, m, day } = parseISO(first);
  const idx = y * 12 + (m - 1) + k;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return iso(ny, nm, Math.min(day, lastDayOfMonth(ny, nm)));
}

export function formatDate(d: ISODate): string {
  const { y, m, day } = parseISO(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Parsea dd/mm/aaaa a ISO. */
export function parseDMY(s: string): ISODate | null {
  const mt = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!mt) return null;
  const day = Number(mt[1]);
  const m = Number(mt[2]);
  const y = Number(mt[3]);
  if (m < 1 || m > 12 || day < 1 || day > lastDayOfMonth(y, m)) return null;
  return iso(y, m, day);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
