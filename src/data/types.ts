import type { AmortSystem, Cents, Installment, ISODate, LoanType, ProvisionTables } from "@/engine";

export interface Branch {
  id: string;
  name: string;
  city: string;
}

export interface User {
  id: string;
  name: string;
  role: "cajero" | "oficial" | "gerente";
  branchId: string;
}

export type AssociateCategory = "Activo" | "Adherente" | "Participante";

export interface Associate {
  id: string;
  number: number;
  name: string;
  dni: string;
  branchId: string;
  category: AssociateCategory;
  occupation: string;
  since: ISODate;
}

export type LoanStatus = "vigente" | "cancelado" | "observada" | "anulado" | "refinanciado";

export interface Loan {
  id: string;
  code: string;
  associateId: string;
  branchId: string;
  type: LoanType;
  system: AmortSystem;
  principal: Cents;
  tnaBps: number;
  n: number;
  startDate: ISODate;
  firstDue: ISODate;
  appraisal?: Cents;
  vehicle?: string;
  installments: Installment[];
  status: LoanStatus;
  credit: Cents;
  refi?: { fromLoanId: string; category: number; fromN: number };
  conflictWith?: string;
  approvedTs: number;
  sample?: string;
}

export interface Payment {
  id: string;
  loanId: string;
  date: ISODate;
  amount: Cents;
  creditUsed: Cents;
  creditAfter: Cents;
  ts: number;
}

export type DepositStatus = "vigente" | "pagado" | "precancelado";

export interface Deposit {
  id: string;
  code: string;
  associateId: string;
  branchId: string;
  capital: Cents;
  termDays: number;
  tnaBps: number;
  start: ISODate;
  maturity: ISODate;
  status: DepositStatus;
  interestPaid?: Cents;
  closedOn?: ISODate;
}

export interface Conflict {
  id: string;
  keptLoanId: string;
  observedLoanId: string;
  reason: string;
  status: "pendiente" | "resuelto";
  decision?: string;
  ts: number;
}

export interface Config {
  personalTnaBps: number;
  prendarioTnaBps: number;
  personalMinN: number;
  personalMaxN: number;
  prendarioMinN: number;
  prendarioMaxN: number;
  maxLtvBps: number;
  encajeBps: number;
  topeBps: number;
  provision: ProvisionTables;
  condonationBps: number;
  passive: Record<string, number>;
  dailyQuota: Record<string, Cents>;
  ownCapital: Cents;
}

export interface State {
  config: Config;
  branches: Branch[];
  users: User[];
  associates: Record<string, Associate>;
  loans: Record<string, Loan>;
  payments: Record<string, Payment>;
  deposits: Record<string, Deposit>;
  conflicts: Record<string, Conflict>;
  /** Monto aprobado por sucursal y día: "branchId|AAAA-MM-DD". */
  dailyUsed: Record<string, Cents>;
  seedRecords: number;
}

export type EventType =
  | "APPROVE_LOAN"
  | "REJECT_LOAN"
  | "REGISTER_PAYMENT"
  | "CREATE_DEPOSIT"
  | "PRECANCEL_DEPOSIT"
  | "MATURE_DEPOSIT"
  | "REFINANCE"
  | "RESOLVE_CONFLICT"
  | "UPDATE_CONFIG"
  | "UNDO"
  | "REDO";

export interface AppEvent {
  id: string;
  ts: number;
  userId: string;
  userName: string;
  branchId: string;
  type: EventType;
  entity: string;
  entityId: string;
  summary: string;
  before: unknown;
  after: unknown;
  payload: any;
}
