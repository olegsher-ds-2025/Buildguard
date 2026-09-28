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

export type DocumentKind = "plan" | "contract" | "other";
export type PlanVersionStatus = "processing" | "ready";

export interface CreateDocumentUploadRequest {
  title: string;
  kind: DocumentKind;
  filename: string;
  contentType: string;
}

/** Storage-first: the client PUTs the file directly to uploadUrl, then calls the confirm endpoint. The API never sees file bytes. */
export interface CreateDocumentUploadResponse {
  documentId: string;
  versionId: string;
  uploadUrl: string;
}

export interface ConfirmDocumentUploadRequest {
  title: string;
  kind: DocumentKind;
}

export interface DocumentVersionSummary {
  id: string;
  versionNo: number;
  status: PlanVersionStatus;
  uploadedAt: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  kind: DocumentKind;
  currentVersion: DocumentVersionSummary | null;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
}

export interface CreateSiteCaptureUploadRequest {
  filename: string;
  contentType: string;
  phaseId?: string;
}

export interface CreateSiteCaptureUploadResponse {
  siteCaptureId: string;
  uploadUrl: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FindingSummary {
  id: string;
  kind: string;
  severity: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  boundingBox: BoundingBox;
  description: string;
  estimatedCostMinMinor: AmountMinorWire | null;
  estimatedCostMaxMinor: AmountMinorWire | null;
  currency: string | null;
  status: DetectionStatus;
  createdAt: string;
  defectId: string | null;
}

export interface ApproveFindingRequest {
  title?: string;
  dueDate?: string;
}

// --- Admin console -----------------------------------------------------

export interface ClientSummary {
  id: string;
  email: string;
  displayName: string;
  projectCount: number;
}

export interface UserDirectoryEntry {
  id: string;
  email: string;
  displayName: string;
  userType: UserType;
  staffRole?: StaffRole;
  status: string;
}

export interface ContractorSummary {
  id: string;
  companyName: string;
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  insuranceExpiryDate: string | null;
  verificationStatus: ContractorVerificationStatus;
  verifiedAt: string | null;
  userEmail: string | null;
}

export interface AdminProjectSummary {
  id: string;
  name: string;
  address: string;
  status: string;
  ownerEmail: string;
  createdAt: string;
}

export interface AuditEntrySummary {
  id: string;
  actorType: "customer" | "staff" | "system";
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// --- Team / roles --------------------------------------------------------

export interface ProjectMemberSummary {
  userId: string;
  email: string;
  displayName: string;
  role: ProjectRole;
  invitedAt: string;
  acceptedAt: string | null;
  isOwner: boolean;
}

export interface InviteMemberRequest {
  email: string;
  role: ProjectRole;
}

export interface ChangeMemberRoleRequest {
  role: ProjectRole;
}

// --- Tenders & Contractors (M8) -------------------------------------------
//
// See docs/high-level-design.md §6.2 for the target match-score formula and
// README's "Known simplifications" for what's deliberately stubbed (geo
// matching, Trust Score) behind seams rather than faked.

export type TenderStatus =
  | "draft"
  | "published"
  | "invited_bidding"
  | "awarded"
  | "cancelled"
  | "closed";

export type TenderInvitationStatus = "invited" | "declined" | "bid_submitted";

export type BidStatus = "submitted" | "withdrawn" | "accepted" | "rejected";

export type ContractStatus = "draft" | "signed" | "active" | "completed" | "terminated";

export interface WorkCategorySummary {
  id: string;
  name: string;
}

export interface TenderSummary {
  id: string;
  projectId: string;
  workCategory: WorkCategorySummary;
  title: string;
  scopeDescription: string;
  budgetMinMinor: AmountMinorWire;
  budgetMaxMinor: AmountMinorWire;
  currency: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  status: TenderStatus;
  publishedAt: string | null;
  createdAt: string;
  /** Only present when the caller has an invitation on this tender. */
  myBidId: string | null;
}

export interface CreateTenderRequest {
  workCategoryId: string;
  title: string;
  scopeDescription: string;
  budgetMinMinor: AmountMinorWire;
  budgetMaxMinor: AmountMinorWire;
  currency: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
}

export interface TenderInvitationSummary {
  contractorProfileId: string;
  companyName: string;
  /** 0..1, computed by the matching engine at invite time — kept for transparency/debugging, see build plan §1. */
  matchScore: number;
  status: TenderInvitationStatus;
  invitedAt: string;
}

export interface BidLineItemSummary {
  description: string;
  quantity: number;
  unitAmountMinor: AmountMinorWire;
  currency: string;
}

export interface BidLineItemRequest {
  description: string;
  quantity: number;
  unitAmountMinor: AmountMinorWire;
  currency: string;
}

export interface BidSummary {
  id: string;
  contractorProfileId: string;
  companyName: string;
  totalAmountMinor: AmountMinorWire;
  currency: string;
  proposedStartDate: string | null;
  proposedEndDate: string | null;
  paymentTermsDescription: string;
  status: BidStatus;
  submittedAt: string;
  lineItems: BidLineItemSummary[];
}

export interface SubmitBidRequest {
  totalAmountMinor: AmountMinorWire;
  currency: string;
  proposedStartDate?: string;
  proposedEndDate?: string;
  paymentTermsDescription: string;
  lineItems?: BidLineItemRequest[];
}

export interface TenderDetailResponse {
  tender: TenderSummary;
  /** Only populated for owner/project_manager callers — a contractor never sees other contractors' invitations. */
  invitations: TenderInvitationSummary[];
  myBid: BidSummary | null;
}

export interface SelectWinnerRequest {
  bidId: string;
}

export interface ContractPaymentMilestoneSummary {
  id: string;
  sequenceNo: number;
  description: string;
  amountMinor: AmountMinorWire;
  currency: string;
  status: "pending" | "released";
  releasedAt: string | null;
}

export interface ContractSummary {
  id: string;
  tenderId: string;
  projectId: string;
  contractorProfileId: string;
  companyName: string;
  totalAmountMinor: AmountMinorWire;
  currency: string;
  status: ContractStatus;
  signedAt: string | null;
  paymentMilestones: ContractPaymentMilestoneSummary[];
}

// --- Contractor self-service (categories / availability) -------------------

export interface ContractorProfileSelfSummary {
  id: string;
  companyName: string;
  verificationStatus: ContractorVerificationStatus;
  currentlyAvailable: boolean;
  categories: WorkCategorySummary[];
}

export interface UpdateContractorProfileRequest {
  currentlyAvailable?: boolean;
  categoryIds?: string[];
}

// --- Admin oversight --------------------------------------------------------

export interface AdminTenderSummary {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  status: TenderStatus;
  bidCount: number;
  createdAt: string;
}

export interface AdminContractSummary {
  id: string;
  projectId: string;
  projectName: string;
  companyName: string;
  totalAmountMinor: AmountMinorWire;
  currency: string;
  status: ContractStatus;
  signedAt: string | null;
}

// --- Trust Score (M9) --------------------------------------------------
//
// See docs/high-level-design.md §6.3 for the target formula. TrustScore is
// computed on read (not a persisted table) — three of its six components
// are stubbed behind seams because Defect/Invoice aren't attributable to a
// specific contractor in this schema yet; see README's "Known
// simplifications" and the Trust Score section header in schema.prisma.

export type TrustScoreComponentKey =
  | "schedule_adherence"
  | "execution_quality"
  | "financial_transparency"
  | "disputes"
  | "service"
  | "tenure_experience";

export interface TrustScoreComponentSummary {
  key: TrustScoreComponentKey;
  /** This component's weight in the formula, e.g. 0.25 for execution_quality. */
  weight: number;
  /** 0..1 — this component's computed value before weighting. */
  value: number;
  /** false for schedule_adherence/execution_quality/financial_transparency — see module header. */
  isReal: boolean;
}

export interface TrustScoreSummary {
  contractorProfileId: string;
  /** 0..100. */
  score: number;
  /** 0..1 — Bayesian shrinkage factor applied for small sample sizes (design doc §6.3). */
  confidence: number;
  /** Number of signed/active/completed contracts this score's confidence is based on. */
  sampleSize: number;
  components: TrustScoreComponentSummary[];
}

export type ReviewStatus = "published" | "rejected";

export interface ReviewSummary {
  id: string;
  projectId: string;
  projectName: string;
  contractorProfileId: string;
  companyName: string;
  reviewerUserId: string;
  reviewerName: string;
  contractId: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  disputeStatus: DisputeStatus | null;
}

export interface CreateReviewRequest {
  contractId: string;
  rating: number;
  comment?: string;
}

export type DisputeStatus = "open" | "upheld" | "dismissed";

export interface DisputeSummary {
  id: string;
  reviewId: string;
  reason: string;
  status: DisputeStatus;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface RaiseDisputeRequest {
  reason: string;
}

export interface ResolveDisputeRequest {
  /** true = the dispute is valid, the review is rejected. false = the dispute is denied, the review stands. */
  upheld: boolean;
  resolutionNote?: string;
}

export interface AdminDisputeSummary {
  id: string;
  reviewId: string;
  companyName: string;
  reviewRating: number;
  reason: string;
  status: DisputeStatus;
  createdAt: string;
}
