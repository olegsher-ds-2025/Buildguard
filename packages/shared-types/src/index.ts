/**
 * Types shared between apps/api and both frontends. Kept hand-written and
 * minimal for now; §5 of the plan has this package growing into the
 * consumer of an OpenAPI-generated surface once the API has enough
 * endpoints to justify codegen.
 */

/** Money is always an integer minor-unit amount + an ISO 4217 currency code — never a float. */
export type AmountMinor = bigint & { readonly __brand: "AmountMinor" };

export function amountMinor(value: bigint | number): AmountMinor {
  return BigInt(value) as AmountMinor;
}

/**
 * BigInt has no JSON representation, so the API serializes AmountMinor
 * fields as decimal strings (apps/api patches BigInt.prototype.toJSON to do
 * this automatically). This is the wire type for every amount DTO field
 * below — parse with BigInt(value) before doing arithmetic on it.
 */
export type AmountMinorWire = string;

export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

export type UserType = "customer" | "staff";

export type StaffRole = "trust_safety_admin" | "ops_admin" | "super_admin";

export type ProjectRole =
  | "owner"
  | "project_manager"
  | "contractor"
  | "inspector"
  | "viewer";

export type ContractorVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

/** A Detection is raw, unapproved AI output. It only ever becomes a Defect through an explicit human approval. */
export type DetectionStatus = "suggested" | "approved" | "dismissed";

export type DefectStatus = "open" | "in_progress" | "resolved" | "closed";

export type InvoiceStatus = "submitted" | "approved" | "rejected";

export type MilestoneStatus = "pending" | "verified";

export interface HealthResponse {
  status: "ok";
  service: string;
  time: string;
}

export type AuthRealm = "monitor" | "admin";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: MeResponse;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  userType: UserType;
  staffRole?: StaffRole;
}

export interface ProjectSummary {
  id: string;
  name: string;
  address: string;
  status: string;
}

export interface PhaseSummary {
  id: string;
  name: string;
  sequenceNo: number;
  status: string;
  currency: string;
  budgetPlannedMinor: AmountMinorWire;
  /** 0-100. Blend of task completion + verified-milestone ratio — see design doc §6.1 and the build plan's phase-1 renormalization. */
  progressPct: number;
}

export interface BudgetLineSummary {
  category: string;
  currency: string;
  plannedAmountMinor: AmountMinorWire;
  actualAmountMinor: AmountMinorWire;
}

export type BurnTier = "ok" | "warning" | "critical";

export interface BudgetSummary {
  currency: string;
  tolerancePct: number;
  totalPlannedMinor: AmountMinorWire;
  totalActualMinor: AmountMinorWire;
  /** actual_spend / progress_pct, per design doc §6.4. Null when progress is 0 and nothing has been spent yet (undefined ratio, not a bad signal). */
  burnRate: number | null;
  burnTier: BurnTier;
  lines: BudgetLineSummary[];
}

export interface NextMilestoneSummary {
  id: string;
  name: string;
  dueDate: string | null;
  daysRemaining: number | null;
}

export interface ProjectDashboardResponse {
  project: ProjectSummary;
  /** Budget-weighted across phases — see the build plan's data-model notes for why a plain average is wrong. */
  overallProgressPct: number;
  phases: PhaseSummary[];
  budget: BudgetSummary;
  nextMilestone: NextMilestoneSummary | null;
  openFindingsCount: number;
}
