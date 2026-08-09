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
