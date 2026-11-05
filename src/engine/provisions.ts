import { pct, type Cents } from "./money";
import type { LoanType } from "./capacity";

/** Tablas en bps por categoría 1..5. */
export interface ProvisionTables {
  common: [number, number, number, number, number];
  preferred: [number, number, number, number, number];
}

export const DEFAULT_TABLES: ProvisionTables = {
  common: [100, 500, 2500, 5000, 10000],
  preferred: [100, 300, 1200, 2500, 5000],
};

export function categoryForDays(days: number): 1 | 2 | 3 | 4 | 5 {
  if (days <= 31) return 1;
  if (days <= 90) return 2;
  if (days <= 180) return 3;
  if (days <= 365) return 4;
  return 5;
}

/**
 * Categoría efectiva: un refinanciado nunca mejora la que tenía al refinanciar,
 * salvo un nivel por cada 3 cuotas seguidas pagadas sin atraso.
 */
export function effectiveCategory(days: number, refiCategory?: number, streak = 0): number {
  const byDays = categoryForDays(days);
  if (!refiCategory) return byDays;
  const floor = Math.max(1, refiCategory - Math.floor(streak / 3));
  return Math.max(byDays, floor);
}

export interface ProvisionInput {
  id: string;
  type: LoanType;
  capital: Cents;
  days: number;
  refiCategory?: number;
  streak?: number;
}

export interface ProvisionRow extends ProvisionInput {
  category: number;
  rateBps: number;
  provision: Cents;
}

export function provisionFor(i: ProvisionInput, tables: ProvisionTables = DEFAULT_TABLES): ProvisionRow {
  const category = effectiveCategory(i.days, i.refiCategory, i.streak ?? 0);
  const table = i.type === "prendario" ? tables.preferred : tables.common;
  const rateBps = table[category - 1];
  return { ...i, category, rateBps, provision: pct(i.capital, rateBps) };
}

export function provisionTotal(rows: ProvisionRow[]): Cents {
  return rows.reduce((s, r) => s + r.provision, 0);
}
