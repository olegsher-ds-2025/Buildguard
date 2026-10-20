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

export type DocumentKind = "plan" | "contract" | "cad" | "other";
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
  phaseId: string | null;
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

// --- RAG Assistant (M10) -----------------------------------------------
//
// UI + plumbing only — see docs/high-level-design.md §7.2 for the target
// architecture and README's "Known simplifications" for what's stubbed.
// MockRagService answers via keyword matching against real project data,
// not a real retrieval+LLM pipeline; RagService is the swap-in seam.

export type MessageRole = "user" | "assistant";

export interface CitationSummary {
  documentId: string | null;
  documentTitle: string | null;
  snippet: string;
}

export interface ChatMessageSummary {
  id: string;
  role: MessageRole;
  content: string;
  citations: CitationSummary[];
  createdAt: string;
}

export interface SendChatMessageRequest {
  content: string;
}

export interface SendChatMessageResponse {
  userMessage: ChatMessageSummary;
  assistantMessage: ChatMessageSummary;
}

// --- CAD/Plan Viewer (M10) -----------------------------------------------
//
// UI + plumbing only — see docs/high-level-design.md §6.5 for the target
// capability and README's "Known simplifications" for what's stubbed.
// The drawing data (baseSvgMarkup/layers) is a hand-authored demo canned by
// MockCadDataProvider, not a real DWG/DXF conversion; CadDataProvider is
// the swap-in seam. Measurement is real and persisted.

export interface CadLayerSummary {
  id: string;
  name: string;
  colorHex: string;
  svgMarkup: string;
  defaultVisible: boolean;
}

export interface CadViewerDataResponse {
  documentId: string;
  baseSvgMarkup: string;
  viewBox: string;
  scaleMetersPerPixel: number;
  layers: CadLayerSummary[];
}

export type MeasurementKind = "length" | "area";

export interface PlanPoint {
  x: number;
  y: number;
}

export interface MeasurementSummary {
  id: string;
  kind: MeasurementKind;
  points: PlanPoint[];
  valueMeters: number;
  unit: string;
  createdByUserId: string;
  createdAt: string;
}

export interface CreateMeasurementRequest {
  kind: MeasurementKind;
  points: PlanPoint[];
}

// --- Supervision checklists ---

export type ChecklistPhaseKind = "before" | "during" | "after" | "general";

export type ChecklistItemType = "visual" | "measurement" | "lab_test" | "document" | "written_approval";

export interface ChecklistThreshold {
  op: "≥" | "≤" | "<" | ">";
  value: number;
  upperValue: number | null;
  unit: string | null;
  raw: string;
}

export interface ChecklistTemplateSummary {
  id: string;
  stageNo: number;
  title: string;
  version: number;
  isSystem: boolean;
  basedOnTemplateId: string | null;
  itemCount: number;
  holdPointCount: number;
}

export interface ChecklistTextBlock {
  text: string;
  subStage: string | null;
}

export interface ChecklistItemSummary {
  id: string;
  sortOrder: number;
  subStage: string | null;
  section: string | null;
  phaseKind: ChecklistPhaseKind;
  text: string;
  standardRef: string | null;
  itemType: ChecklistItemType;
  mandatory: boolean;
  thresholds: ChecklistThreshold[];
  thresholdsReviewed: boolean;
  requiresBeforeCoverPhoto: boolean;
}

export interface ChecklistHoldPointSummary {
  id: string;
  sortOrder: number;
  subStage: string | null;
  text: string;
}

export interface CommonDefectSummary {
  id: string;
  subStage: string | null;
  text: string;
  costMinMinor: AmountMinorWire | null;
  costMaxMinor: AmountMinorWire | null;
}

export interface ChecklistTemplateDetail extends ChecklistTemplateSummary {
  standards: ChecklistTextBlock[];
  notes: ChecklistTextBlock[];
  items: ChecklistItemSummary[];
  holdPoints: ChecklistHoldPointSummary[];
  commonDefects: CommonDefectSummary[];
}

// --- Inspections & defects ---

export type InspectionStatus = "open" | "completed";
export type InspectionOutcome = "ok" | "fail" | "na";
export type DefectSource = "ai_vision" | "checklist" | "manual";

export interface InspectionSummary {
  id: string;
  phaseId: string;
  phaseName: string;
  templateId: string;
  stageNo: number;
  title: string;
  inspectorUserId: string;
  status: InspectionStatus;
  startedAt: string;
  completedAt: string | null;
  answeredCount: number;
  itemCount: number;
}

export interface InspectionItemState extends ChecklistItemSummary {
  outcome: InspectionOutcome | null;
  numericValue: number | null;
  outOfThreshold: boolean;
  note: string | null;
  defectId: string | null;
  beforeCoverPhotoCount: number;
}

export interface InspectionDetail extends InspectionSummary {
  items: InspectionItemState[];
  holdPoints: ChecklistHoldPointSummary[];
}

export interface CreateInspectionRequest {
  phaseId: string;
  templateId: string;
}

export interface RecordInspectionResultRequest {
  checklistItemId: string;
  outcome: InspectionOutcome;
  numericValue?: number;
  note?: string;
  /** Severity for the defect a failed item opens; 1 (cosmetic) – 5 (critical). Defaults to 3. */
  severity?: number;
}

export interface DefectSummary {
  id: string;
  title: string;
  severity: number;
  status: DefectStatus;
  source: DefectSource;
  phaseId: string | null;
  assignedToUserId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignDefectRequest {
  assigneeUserId: string;
  dueDate?: string;
}

export type DefectAction = "start" | "fix" | "verify" | "reopen";

export interface DefectActionRequest {
  note?: string;
}

// --- Photos ---

export type PhotoTag = "defect" | "inspection" | "approval" | "before_cover" | "after";

/** Coordinates are fractions (0–1) of the image width/height so markup survives any display size. */
export type PhotoMarkupShape =
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { type: "circle"; x: number; y: number; r: number }
  | { type: "text"; x: number; y: number; text: string };

export interface PhotoLinks {
  phaseId?: string;
  inspectionId?: string;
  checklistItemId?: string;
  defectId?: string;
}

export interface CreatePhotoUploadRequest {
  contentType: string;
}

export interface CreatePhotoUploadResponse {
  photoId: string;
  uploadUrl: string;
}

export interface ConfirmPhotoUploadRequest extends PhotoLinks {
  tag: PhotoTag;
  markup?: PhotoMarkupShape[];
  gpsLat?: number;
  gpsLng?: number;
  takenAt?: string;
}

export interface PhotoSummary extends PhotoLinks {
  id: string;
  tag: PhotoTag;
  url: string;
  markup: PhotoMarkupShape[];
  gpsLat: number | null;
  gpsLng: number | null;
  takenAt: string | null;
  uploadedByUserId: string;
  createdAt: string;
}

// --- Checklist template editing ---

export interface ChecklistThresholdInput {
  op: ChecklistThreshold["op"];
  value: number;
  upperValue?: number;
  unit?: string;
  raw?: string;
}

export interface UpdateChecklistTemplateRequest {
  title: string;
}

export interface UpdateChecklistItemRequest {
  text?: string;
  subStage?: string;
  section?: string;
  phaseKind?: ChecklistPhaseKind;
  itemType?: ChecklistItemType;
  standardRef?: string;
  mandatory?: boolean;
  requiresBeforeCoverPhoto?: boolean;
  thresholds?: ChecklistThresholdInput[];
  thresholdsReviewed?: boolean;
}

export interface CreateChecklistItemRequest extends UpdateChecklistItemRequest {
  text: string;
  phaseKind: ChecklistPhaseKind;
  itemType: ChecklistItemType;
  /** Insert after this item; appended at the end when omitted. */
  afterItemId?: string;
}

export interface SaveChecklistHoldPointRequest {
  text: string;
  subStage?: string;
}

// --- Hold points & stage gate ---

export type HoldPointState = "open" | "signed" | "bypassed";
export type HoldPointSignerCapacity = "engineer" | "soil_consultant" | "inspector" | "lab" | "other";

export interface HoldPointSummary {
  id: string;
  phaseId: string;
  phaseName: string;
  text: string;
  subStage: string | null;
  state: HoldPointState;
  closedAt: string | null;
  signerName: string | null;
  signerCapacity: HoldPointSignerCapacity | null;
  /** Mandatory justification when state is "bypassed". */
  reason: string | null;
  photoId: string | null;
  documentId: string | null;
}

export interface SignHoldPointRequest {
  signerName: string;
  signerCapacity: HoldPointSignerCapacity;
  /** At least one attachment is required: the approval document or a photo. */
  photoId?: string;
  documentId?: string;
  note?: string;
}

export interface BypassHoldPointRequest {
  reason: string;
}

export interface InstantiateHoldPointsRequest {
  templateId: string;
}

export interface ReopenHoldPointRequest {
  note?: string;
}

// --- Lab tests, timed tests & notifications ---

export type ConcreteResultVerdict = "pass" | "fail";
export type FormworkStatus = "removed" | "ready" | "too_early" | "span_unknown" | "blocked_failed_cubes";

export interface ConcreteResultSummary {
  id: string;
  ageDays: number;
  strengthMpa: number;
  verdict: ConcreteResultVerdict;
  testedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface ConcretePourSummary {
  id: string;
  phaseId: string | null;
  element: string;
  concreteGrade: string;
  requiredMpa28: number;
  deliveryNote: string | null;
  slumpCm: number | null;
  spanMeters: number | null;
  cantileverMeters: number | null;
  castAt: string;
  /** Latest result per age (7 and 28 days). */
  results: ConcreteResultSummary[];
  result7DueAt: string;
  result28DueAt: string;
  earliestFormworkRemovalAt: string | null;
  formworkStatus: FormworkStatus;
  formworkRemovedAt: string | null;
}

export interface CreateConcretePourRequest {
  element: string;
  concreteGrade: string;
  /** Required unless the grade is one the checklist gives a figure for (ב-30). */
  requiredMpa28?: number;
  deliveryNote?: string;
  slumpCm?: number;
  spanMeters?: number;
  cantileverMeters?: number;
  castAt: string;
  phaseId?: string;
}

export interface RecordConcreteResultRequest {
  ageDays: 7 | 28;
  strengthMpa: number;
  testedAt?: string;
  note?: string;
}

export type TimedTestKind = "pressure" | "flood";
export type TimedTestOutcome = "passed" | "failed";
export type TimedTestStatus = "running" | "due" | "passed" | "failed";

export interface TimedTestSummary {
  id: string;
  kind: TimedTestKind;
  phaseId: string | null;
  location: string;
  startedAt: string;
  durationHours: number;
  dueAt: string;
  unit: string;
  startReading: number | null;
  endReading: number | null;
  status: TimedTestStatus;
  outcome: TimedTestOutcome | null;
  note: string | null;
  completedAt: string | null;
}

export interface StartTimedTestRequest {
  kind: TimedTestKind;
  location: string;
  startedAt?: string;
  durationHours?: number;
  startReading?: number;
  phaseId?: string;
  startPhotoId?: string;
}

export interface CompleteTimedTestRequest {
  outcome: TimedTestOutcome;
  endReading?: number;
  note?: string;
  endPhotoId?: string;
}

export interface NotificationSummary {
  id: string;
  projectId: string | null;
  /** lab_result_due | cube_failed | timed_test_due | pour_coordination */
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

// --- Daily logs ---

export interface HeadcountEntry {
  name: string;
  workers: number;
}

export type DailyLogStatus = "draft" | "locked";

export interface DailyLogSummary {
  id: string;
  /** YYYY-MM-DD */
  logDate: string;
  status: DailyLogStatus;
  weatherCode: number | null;
  temperatureC: number | null;
  headcount: HeadcountEntry[];
  workDone: string;
  safetyOk: boolean | null;
  safetyNotes: string | null;
  /** Pours scheduled or cast on this date (Asia/Jerusalem), read from the lab-test records. */
  pours: { id: string; element: string; concreteGrade: string }[];
  approvedAt: string | null;
  contentHash: string | null;
}

export interface SaveDailyLogRequest {
  weatherCode?: number | null;
  temperatureC?: number | null;
  headcount?: HeadcountEntry[];
  workDone?: string;
  safetyOk?: boolean | null;
  safetyNotes?: string | null;
}

export interface CreateDailyLogRequest extends SaveDailyLogRequest {
  /** YYYY-MM-DD */
  logDate: string;
}

/** WMO weather-interpretation codes (as returned by Open-Meteo), grouped for a site log. */
export function weatherLabelHe(code: number | null): string {
  if (code === null) return "—";
  if (code === 0) return "בהיר";
  if (code <= 3) return "מעונן חלקית";
  if (code === 45 || code === 48) return "ערפל";
  if (code >= 51 && code <= 57) return "טפטוף";
  if (code >= 61 && code <= 67) return "גשם";
  if (code >= 71 && code <= 77) return "שלג";
  if (code >= 80 && code <= 82) return "ממטרים";
  if (code >= 95) return "סופת רעמים";
  return "—";
}

/** Representative codes for the manual weather picker, in display order. */
export const WEATHER_CHOICES: number[] = [0, 2, 45, 53, 63, 81, 95];

// --- Form 4 readiness ---

export const FORM4_REQUIREMENTS: { key: string; titleHe: string }[] = [
  { key: "plumbing_lab", titleHe: 'בדיקת מעבדה לאינסטלציה (ת"י 1205)' },
  { key: "electrical_inspector", titleHe: "אישור בודק חשמל מוסמך" },
  { key: "gas_tightness", titleHe: 'בדיקת אטימות גז (ת"י 158)' },
  { key: "mamad_seal", titleHe: 'בדיקת אטימות ממ"ד' },
  { key: "solar_heater", titleHe: 'דוד שמש (ת"י 579)' },
  { key: "statutory_foundations_report", titleHe: "דיווח סטטוטורי — גמר יסודות" },
  { key: "statutory_structure_report", titleHe: "דיווח סטטוטורי — גמר שלד" },
  { key: "as_made_drawings", titleHe: "מדידות ותוכניות As-Made" },
  { key: "basic_development", titleHe: "פיתוח בסיסי" },
];

export interface Form4ItemSummary {
  key: string;
  satisfied: boolean;
  documentId: string | null;
  documentTitle: string | null;
  note: string | null;
  satisfiedAt: string | null;
}

export interface Form4Readiness {
  items: Form4ItemSummary[];
  satisfiedCount: number;
  totalCount: number;
  readinessPct: number;
  /** Things that should be settled before the file goes to the authority. */
  blockers: { openHoldPoints: number; unapprovedPhases: number; failedConcreteResults: number };
}

export interface SaveForm4ItemRequest {
  satisfied: boolean;
  /** Required when marking an item satisfied. */
  documentId?: string;
  note?: string;
}

// --- AI quote comparison ---

export type QuoteStatus = "uploaded" | "extracted" | "failed";

/** What the model read from one quote document. Null means the document does not say; nothing is guessed. */
export interface ExtractedQuote {
  supplierName: string | null;
  totalAmountIls: number | null;
  vatIncluded: boolean | null;
  scopeItems: string[];
  exclusions: string[];
  payment: { advancePct: number | null; schedule: string | null };
  warranty: { years: number | null; notes: string | null };
  timelineDays: number | null;
  notes: string | null;
}

export type QuoteRiskCode = "high_advance" | "missing_warranty" | "vague_scope" | "no_total" | "price_unusually_low";

/** Computed by the server from the extracted fields, not by the model. */
export interface QuoteRisk {
  code: QuoteRiskCode;
  severity: "warning" | "critical";
  detail: string | null;
}

export interface QuoteSummary {
  id: string;
  filename: string;
  contentType: string;
  supplierName: string | null;
  status: QuoteStatus;
  extraction: ExtractedQuote | null;
  risks: QuoteRisk[];
  error: string | null;
}

export type ScopeCoverage = "included" | "missing" | "unclear";
export type RequirementCoverage = "covered" | "missing" | "unclear";

export interface QuoteComparisonAnalysis {
  /** Quote ids in the order the coverage arrays below follow. */
  quoteIds: string[];
  scopeMatrix: { item: string; coverage: ScopeCoverage[] }[];
  /** The stage's professional requirements (from the supervision checklist) checked against each quote. */
  requirementCoverage: { requirement: string; coverage: RequirementCoverage[] }[];
  recommendedQuoteId: string | null;
  rationale: string;
  questions: string[];
  negotiationTips: string[];
}

export interface QuoteComparisonSummary {
  id: string;
  title: string;
  stageNo: number | null;
  quotes: QuoteSummary[];
  analysis: QuoteComparisonAnalysis | null;
  analyzedAt: string | null;
  createdAt: string;
}

export interface CreateQuoteComparisonRequest {
  title: string;
  /** Checklist stage 1-15 to cross-check quotes against. */
  stageNo?: number;
}

export interface CreateQuoteUploadRequest {
  filename: string;
  contentType: string;
}

export interface CreateQuoteUploadResponse {
  quoteId: string;
  uploadUrl: string;
}

export interface ConfirmQuoteUploadRequest {
  filename: string;
  contentType: string;
  supplierName?: string;
}

// --- Leads (landing page) ---

export type LeadKind = "register" | "contact";
export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "closed" | "spam";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "חדש",
  contacted: "נוצר קשר",
  qualified: "מתאים",
  converted: "הומר ללקוח",
  closed: "סגור",
  spam: "ספאם",
};

export const LEAD_KIND_LABELS: Record<LeadKind, string> = {
  register: "הרשמה",
  contact: "פנייה",
};

/** Allowed values of the register form's `role` field. */
export const LEAD_ROLE_LABELS: Record<string, string> = {
  inspector: "מפקח / מהנדס",
  owner_builder: "בונה פרטי",
  contractor: "קבלן",
  project_manager: "מנהל פרויקט",
  viewer: "צפייה בלבד (עו״ד, שמאי)",
  other: "אחר",
};

/** Allowed values of the register form's `projectStage` field. */
export const LEAD_STAGE_LABELS: Record<string, string> = {
  planning: "תכנון",
  permit: "היתר",
  foundation: "יסודות",
  structure: "שלד",
  finishing: "גמרים",
  handover: "מסירה",
};

/** Which landing page a lead came from; set by the page, not chosen by the visitor. */
export const LEAD_AUDIENCE_LABELS: Record<string, string> = {
  owner: "בעל בית",
  contractor: "קבלן",
  other: "אחר",
};

/** Allowed values of the owner form's `projectKind` field. */
export const LEAD_PROJECT_KIND_LABELS: Record<string, string> = {
  new_build: "בנייה חדשה",
  extension: "תוספת בנייה",
  renovation: "שיפוץ",
  other: "אחר",
};

/** Allowed values of the owner form's `budgetRange` field. */
export const LEAD_BUDGET_LABELS: Record<string, string> = {
  under_250k: "עד 250 אלף ₪",
  "250k_1m": "250 אלף עד מיליון ₪",
  "1m_3m": "1 עד 3 מיליון ₪",
  over_3m: "מעל 3 מיליון ₪",
  unknown: "עוד לא ידוע",
};

/** Allowed values of the contractor form's `trades` field. */
export const LEAD_TRADE_LABELS: Record<string, string> = {
  general_contractor: "קבלן ראשי",
  excavation: "עבודות עפר",
  structure_concrete: "שלד ובטון",
  roofing: "גגות ואיטום",
  plumbing: "אינסטלציה",
  electrical: "חשמל",
  finishing: "גמרים",
  other: "אחר",
};

/** Allowed values of the contractor form's `teamSize` field. */
export const LEAD_TEAM_SIZE_LABELS: Record<string, string> = {
  solo: "עצמאי",
  "2_5": "2–5 עובדים",
  "6_20": "6–20 עובדים",
  over_20: "מעל 20 עובדים",
};

/** Allowed values of the contact form's `topic` field. */
export const LEAD_TOPIC_LABELS: Record<string, string> = {
  general: "שאלה כללית",
  demo: "תיאום הדגמה",
  pilot: "פיילוט",
  other: "אחר",
};

export interface LeadSummary {
  id: string;
  kind: LeadKind;
  status: LeadStatus;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  projectCount: number | null;
  projectStage: string | null;
  region: string | null;
  company: string | null;
  topic: string | null;
  message: string | null;
  marketingOptIn: boolean;
  audience: string | null;
  landingPath: string | null;
  projectKind: string | null;
  budgetRange: string | null;
  needContractors: boolean | null;
  trades: string[];
  teamSize: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  staffNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateLeadRequest {
  status?: LeadStatus;
  staffNotes?: string;
}
