import { DEFAULT_TABLES, toCents } from "@/engine";
import type { Branch, Config, User } from "./types";

/**
 * Clave del panel /admin. Se puede cambiar con la variable VITE_ADMIN_PASSWORD
 * (archivo .env) o editando este valor por defecto.
 */
export const ADMIN_PASSWORD: string = (import.meta.env?.VITE_ADMIN_PASSWORD as string | undefined) ?? "mutualcat2026";

/** Semilla numérica fija del generador de datos de ejemplo. */
export const SEED = 20260611;
/** Fecha de referencia de la semilla (los datos se generan hasta este día). */
export const SEED_REF = "2026-11-06";

export const BRANCHES: Branch[] = [
  { id: "VT", name: "Casa Central", city: "Venado Tuerto" },
  { id: "FI", name: "Sucursal Firmat", city: "Firmat" },
  { id: "RU", name: "Sucursal Rufino", city: "Rufino" },
  { id: "CA", name: "Sucursal Casilda", city: "Casilda" },
  { id: "VC", name: "Sucursal Villa Cañás", city: "Villa Cañás" },
  { id: "EL", name: "Sucursal Elortondo", city: "Elortondo" },
];

export const USERS: User[] = [
  { id: "u1", name: "Graciela Pereyra", role: "gerente", branchId: "VT" },
  { id: "u2", name: "Martín Bustos", role: "cajero", branchId: "VT" },
  { id: "u3", name: "Lorena Giuliani", role: "cajero", branchId: "FI" },
  { id: "u4", name: "Sergio Ferrero", role: "oficial", branchId: "RU" },
  { id: "u5", name: "Paula Mansilla", role: "cajero", branchId: "CA" },
  { id: "u6", name: "Diego Albornoz", role: "cajero", branchId: "VC" },
  { id: "u7", name: "Natalia Rinaldi", role: "gerente", branchId: "EL" },
];

/** Valores de ejemplo: no son normas ni valores reales del regulador. */
export function defaultConfig(ownCapital = toCents(300_000_000)): Config {
  return {
    personalTnaBps: 4500,
    prendarioTnaBps: 3800,
    personalMinN: 6,
    personalMaxN: 24,
    prendarioMinN: 12,
    prendarioMaxN: 36,
    maxLtvBps: 7000,
    encajeBps: 1500,
    topeBps: 800,
    provision: structuredClone(DEFAULT_TABLES),
    condonationBps: 3000,
    passive: { "30": 2800, "60": 2900, "90": 3000, "180": 3200 },
    dailyQuota: {
      VT: toCents(60_000_000),
      FI: toCents(25_000_000),
      RU: toCents(20_000_000),
      CA: toCents(25_000_000),
      VC: 0,
      EL: toCents(15_000_000),
    },
    ownCapital,
  };
}
