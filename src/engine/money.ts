/**
 * Aritmética monetaria en centavos enteros con redondeo half-up explícito.
 * Las tasas se expresan en puntos básicos (bps): 4500 = 45 %.
 */
export type Cents = number;

/** División entera con redondeo half-up (mitad alejándose de cero). */
export function divHalfUp(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error("División por cero");
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (2n * a + den) / (2n * den);
  return neg ? -q : q;
}

/** Multiplica centavos por una fracción num/den con redondeo half-up. */
export function mulFrac(c: Cents, num: number | bigint, den: number | bigint): Cents {
  return Number(divHalfUp(BigInt(c) * BigInt(num), BigInt(den)));
}

/** c × bps / 10000 redondeado half-up. */
export function pct(c: Cents, bps: number): Cents {
  return mulFrac(c, bps, 10000);
}

/** Convierte pesos (número con hasta 2 decimales) a centavos. */
export function toCents(pesos: number): Cents {
  return Math.round(pesos * 100);
}

/** Parsea un importe escrito en formato argentino ("1.234.567,89" o "1234567.89"). */
export function parseARS(input: string): Cents | null {
  let s = input.replace(/\$/g, "").replace(/\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const [ent, dec = ""] = s.replace("-", "").split(".");
  const c = Number(ent) * 100 + Number((dec + "00").slice(0, 2));
  return s.startsWith("-") ? -c : c;
}

/** Formato argentino: $ 1.234.567,89 */
export function formatARS(c: Cents, withSymbol = true): string {
  const neg = c < 0;
  const abs = Math.abs(c);
  const ent = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  const entStr = String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = `${entStr},${dec}`;
  return `${neg ? "−" : ""}${withSymbol ? "$ " : ""}${body}`;
}

/** Formato de porcentaje desde bps: 4500 -> "45 %" , 1250 -> "12,5 %" */
export function formatBps(bps: number): string {
  const v = bps / 100;
  return `${String(Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, "")).replace(".", ",")} %`;
}
