import type {
  AdminContractSummary,
  AdminDisputeSummary,
  AdminProjectSummary,
  AdminTenderSummary,
  ApproveFindingRequest,
  AssignDefectRequest,
  AuditEntrySummary,
  BypassHoldPointRequest,
  BidSummary,
  CadViewerDataResponse,
  ChangeMemberRoleRequest,
  ChatMessageSummary,
  ChecklistHoldPointSummary,
  ChecklistItemSummary,
  ChecklistTemplateDetail,
  ChecklistTemplateSummary,
  ClientSummary,
  CompleteTimedTestRequest,
  ConcretePourSummary,
  ConfirmDocumentUploadRequest,
  ConfirmPhotoUploadRequest,
  ConfirmQuoteUploadRequest,
  CreateInspectionRequest,
  ContractPaymentMilestoneSummary,
  ContractSummary,
  ContractorProfileSelfSummary,
  ContractorSummary,
  CreateChecklistItemRequest,
  CreateDailyLogRequest,
  CreateConcretePourRequest,
  CreateDocumentUploadRequest,
  CreateDocumentUploadResponse,
  CreateMeasurementRequest,
  CreateQuoteComparisonRequest,
  CreateQuoteUploadRequest,
  CreateQuoteUploadResponse,
  CreatePhotoUploadRequest,
  CreatePhotoUploadResponse,
  CreateReviewRequest,
  CreateSiteCaptureUploadRequest,
  CreateSiteCaptureUploadResponse,
  CreateTenderRequest,
  DailyLogSummary,
  DefectAction,
  DefectSummary,
  DisputeSummary,
  DocumentSummary,
  DownloadUrlResponse,
  FindingSummary,
  Form4Readiness,
  HealthResponse,
  HoldPointSummary,
  InspectionDetail,
  InspectionItemState,
  InspectionSummary,
  InstantiateHoldPointsRequest,
  InviteMemberRequest,
  LeadKind,
  LeadStatus,
  LeadSummary,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MeasurementSummary,
  NotificationSummary,
  PhotoSummary,
  PhotoTag,
  ProjectDashboardResponse,
  ProjectMemberSummary,
  ProjectSummary,
  QuoteComparisonSummary,
  RaiseDisputeRequest,
  RecordConcreteResultRequest,
  SaveDailyLogRequest,
  SaveForm4ItemRequest,
  ReopenHoldPointRequest,
  RecordInspectionResultRequest,
  ResolveDisputeRequest,
  ReviewSummary,
  SaveChecklistHoldPointRequest,
  SelectWinnerRequest,
  SignHoldPointRequest,
  SendChatMessageRequest,
  SendChatMessageResponse,
  StartTimedTestRequest,
  SubmitBidRequest,
  TenderDetailResponse,
  TenderSummary,
  TimedTestSummary,
  TrustScoreSummary,
  UpdateChecklistItemRequest,
  UpdateChecklistTemplateRequest,
  UpdateContractorProfileRequest,
  UpdateLeadRequest,
  UserDirectoryEntry,
  WorkCategorySummary,
} from "@buildguard/shared-types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
  }
}

/** Sent as `Idempotency-Key`, so a retried request (e.g. from the offline queue) is applied once. */
export interface RequestOptions {
  idempotencyKey?: string;
}

const idempotencyHeaders = (opts?: RequestOptions): Record<string, string> =>
  opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {};

export interface ApiClientOptions {
  /** Called when a request comes back 401, e.g. to sign the user out of an expired session. */
  onUnauthorized?: () => void;
  /** Base URL of the api service, e.g. http://localhost:3000/api/v1 */
  baseUrl: string;
  /** Returns the current access token, if any. Kept as a callback so callers can read from their own auth store. */
  getAccessToken?: () => string | null;
}

function leadQuery(filter: { kind?: LeadKind; status?: LeadStatus }): string {
  const params = new URLSearchParams();
  if (filter.kind) params.set("kind", filter.kind);
  if (filter.status) params.set("status", filter.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Thin typed fetch wrapper shared by both frontends. Endpoint-specific
 * functions (dashboard, findings, contractors, ...) are added here as the
 * corresponding API modules ship, so both apps stay on one source of truth
 * for request/response shapes instead of hand-rolling fetch calls per app.
 *
 * Kept as a single flat file rather than a barrel re-export: tsc emits
 * cross-file CJS re-exports as `Object.defineProperty(..., { get(){...} })`,
 * which Rollup's commonjs plugin (used by Vite's production build) does not
 * always resolve into a static named export.
 */
export function createApiClient({ baseUrl, getAccessToken, onUnauthorized }: ApiClientOptions) {
  async function download(path: string): Promise<Blob> {
    const token = getAccessToken?.();
    const res = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      if (res.status === 401 && token) onUnauthorized?.();
      throw new ApiError(res.status, await res.json().catch(() => undefined));
    }
    return res.blob();
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getAccessToken?.();
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      // A rejected login is a 401 too, but there is no session to end then.
      if (res.status === 401 && token) onUnauthorized?.();
      throw new ApiError(res.status, body);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  function login(realm: "customer" | "staff", body: LoginRequest): Promise<LoginResponse> {
    return request<LoginResponse>(`/auth/${realm}/login`, { method: "POST", body: JSON.stringify(body) });
  }

  return {
    health: () => request<HealthResponse>("/health"),
    loginCustomer: (body: LoginRequest) => login("customer", body),
    loginStaff: (body: LoginRequest) => login("staff", body),
    me: () => request<MeResponse>("/auth/me"),
    listProjects: () => request<ProjectSummary[]>("/projects"),
    getProjectDashboard: (projectId: string) =>
      request<ProjectDashboardResponse>(`/projects/${projectId}/dashboard`),
    listDocuments: (projectId: string) => request<DocumentSummary[]>(`/projects/${projectId}/documents`),
    createDocumentUpload: (projectId: string, body: CreateDocumentUploadRequest) =>
      request<CreateDocumentUploadResponse>(`/projects/${projectId}/documents`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    confirmDocumentUpload: (
      projectId: string,
      documentId: string,
      versionId: string,
      body: ConfirmDocumentUploadRequest,
    ) =>
      request<DocumentSummary>(`/projects/${projectId}/documents/${documentId}/versions/${versionId}/confirm`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getDocumentDownloadUrl: (projectId: string, documentId: string) =>
      request<DownloadUrlResponse>(`/projects/${projectId}/documents/${documentId}/download`),
    listFindings: (projectId: string) => request<FindingSummary[]>(`/projects/${projectId}/findings`),
    approveFinding: (projectId: string, detectionId: string, body: ApproveFindingRequest = {}) =>
      request<FindingSummary>(`/projects/${projectId}/findings/${detectionId}/approve`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    dismissFinding: (projectId: string, detectionId: string) =>
      request<FindingSummary>(`/projects/${projectId}/findings/${detectionId}/dismiss`, { method: "POST" }),
    createSiteCaptureUpload: (projectId: string, body: CreateSiteCaptureUploadRequest) =>
      request<CreateSiteCaptureUploadResponse>(`/projects/${projectId}/site-captures`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    confirmSiteCaptureUpload: (projectId: string, siteCaptureId: string, phaseId?: string) =>
      request<FindingSummary[]>(`/projects/${projectId}/site-captures/${siteCaptureId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ phaseId }),
      }),
    adminListContractors: () => request<ContractorSummary[]>("/admin/contractors"),
    adminVerifyContractor: (contractorId: string) =>
      request<ContractorSummary>(`/admin/contractors/${contractorId}/verify`, { method: "POST" }),
    adminRejectContractor: (contractorId: string, reason?: string) =>
      request<ContractorSummary>(`/admin/contractors/${contractorId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    adminListUsers: () => request<UserDirectoryEntry[]>("/admin/users"),
    adminListClients: () => request<ClientSummary[]>("/admin/clients"),
    adminListProjects: () => request<AdminProjectSummary[]>("/admin/projects"),
    adminListAuditLog: () => request<AuditEntrySummary[]>("/admin/audit-log"),
    adminListLeads: (filter: { kind?: LeadKind; status?: LeadStatus } = {}) =>
      request<LeadSummary[]>(`/admin/leads${leadQuery(filter)}`),
    adminUpdateLead: (leadId: string, body: UpdateLeadRequest) =>
      request<LeadSummary>(`/admin/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(body) }),
    adminDownloadLeadsCsv: (filter: { kind?: LeadKind; status?: LeadStatus } = {}) =>
      download(`/admin/leads.csv${leadQuery(filter)}`),
    listMembers: (projectId: string) => request<ProjectMemberSummary[]>(`/projects/${projectId}/members`),
    inviteMember: (projectId: string, body: InviteMemberRequest) =>
      request<ProjectMemberSummary>(`/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    changeMemberRole: (projectId: string, userId: string, body: ChangeMemberRoleRequest) =>
      request<ProjectMemberSummary>(`/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    removeMember: (projectId: string, userId: string) =>
      request<void>(`/projects/${projectId}/members/${userId}`, { method: "DELETE" }),

    // --- Tenders & Contractors (M8) ---
    listWorkCategories: () => request<WorkCategorySummary[]>("/work-categories"),
    listTenders: (projectId: string) => request<TenderSummary[]>(`/projects/${projectId}/tenders`),
    getTender: (projectId: string, tenderId: string) =>
      request<TenderDetailResponse>(`/projects/${projectId}/tenders/${tenderId}`),
    createTender: (projectId: string, body: CreateTenderRequest) =>
      request<TenderSummary>(`/projects/${projectId}/tenders`, { method: "POST", body: JSON.stringify(body) }),
    publishTender: (projectId: string, tenderId: string) =>
      request<TenderSummary>(`/projects/${projectId}/tenders/${tenderId}/publish`, { method: "POST" }),
    cancelTender: (projectId: string, tenderId: string) =>
      request<TenderSummary>(`/projects/${projectId}/tenders/${tenderId}/cancel`, { method: "POST" }),
    listBids: (projectId: string, tenderId: string) =>
      request<BidSummary[]>(`/projects/${projectId}/tenders/${tenderId}/bids`),
    submitBid: (projectId: string, tenderId: string, body: SubmitBidRequest) =>
      request<BidSummary>(`/projects/${projectId}/tenders/${tenderId}/bids`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    withdrawBid: (projectId: string, tenderId: string, bidId: string) =>
      request<BidSummary>(`/projects/${projectId}/tenders/${tenderId}/bids/${bidId}/withdraw`, { method: "POST" }),
    selectWinner: (projectId: string, tenderId: string, body: SelectWinnerRequest) =>
      request<ContractSummary>(`/projects/${projectId}/tenders/${tenderId}/select-winner`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getContract: (projectId: string, contractId: string) =>
      request<ContractSummary>(`/projects/${projectId}/contracts/${contractId}`),
    listPaymentMilestones: (projectId: string, contractId: string) =>
      request<ContractPaymentMilestoneSummary[]>(`/projects/${projectId}/contracts/${contractId}/payment-milestones`),
    signContract: (projectId: string, contractId: string) =>
      request<ContractSummary>(`/projects/${projectId}/contracts/${contractId}/sign`, { method: "POST" }),
    getMyContractorProfile: () => request<ContractorProfileSelfSummary>("/contractor-profile/me"),
    updateMyContractorProfile: (body: UpdateContractorProfileRequest) =>
      request<ContractorProfileSelfSummary>("/contractor-profile/me", { method: "PATCH", body: JSON.stringify(body) }),
    adminListTenders: () => request<AdminTenderSummary[]>("/admin/tenders"),
    adminListContracts: () => request<AdminContractSummary[]>("/admin/contracts"),

    // --- Trust Score (M9) ---
    listProjectReviews: (projectId: string) => request<ReviewSummary[]>(`/projects/${projectId}/reviews`),
    createReview: (projectId: string, body: CreateReviewRequest) =>
      request<ReviewSummary>(`/projects/${projectId}/reviews`, { method: "POST", body: JSON.stringify(body) }),
    getTrustScore: (contractorProfileId: string) =>
      request<TrustScoreSummary>(`/contractor-profiles/${contractorProfileId}/trust-score`),
    listContractorReviews: (contractorProfileId: string) =>
      request<ReviewSummary[]>(`/contractor-profiles/${contractorProfileId}/reviews`),
    raiseDispute: (reviewId: string, body: RaiseDisputeRequest) =>
      request<DisputeSummary>(`/reviews/${reviewId}/disputes`, { method: "POST", body: JSON.stringify(body) }),
    adminListOpenDisputes: () => request<AdminDisputeSummary[]>("/admin/disputes"),
    adminResolveDispute: (disputeId: string, body: ResolveDisputeRequest) =>
      request<DisputeSummary>(`/admin/disputes/${disputeId}/resolve`, { method: "POST", body: JSON.stringify(body) }),

    // --- RAG Assistant (M10) ---
    listChatMessages: (projectId: string) => request<ChatMessageSummary[]>(`/projects/${projectId}/chat/messages`),
    sendChatMessage: (projectId: string, body: SendChatMessageRequest) =>
      request<SendChatMessageResponse>(`/projects/${projectId}/chat/messages`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    // --- CAD/Plan Viewer (M10) ---
    getCadViewerData: (projectId: string, documentId: string) =>
      request<CadViewerDataResponse>(`/projects/${projectId}/documents/${documentId}/cad/viewer`),
    listMeasurements: (projectId: string, documentId: string) =>
      request<MeasurementSummary[]>(`/projects/${projectId}/documents/${documentId}/cad/measurements`),
    createMeasurement: (projectId: string, documentId: string, body: CreateMeasurementRequest) =>
      request<MeasurementSummary>(`/projects/${projectId}/documents/${documentId}/cad/measurements`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    // --- Supervision checklists ---
    listChecklistTemplates: () => request<ChecklistTemplateSummary[]>("/checklist-templates"),
    getChecklistTemplate: (templateId: string) =>
      request<ChecklistTemplateDetail>(`/checklist-templates/${templateId}`),
    cloneChecklistTemplate: (templateId: string) =>
      request<ChecklistTemplateDetail>(`/checklist-templates/${templateId}/clone`, { method: "POST" }),
    updateChecklistTemplate: (templateId: string, body: UpdateChecklistTemplateRequest) =>
      request<void>(`/checklist-templates/${templateId}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteChecklistTemplate: (templateId: string) =>
      request<void>(`/checklist-templates/${templateId}`, { method: "DELETE" }),
    createChecklistItem: (templateId: string, body: CreateChecklistItemRequest) =>
      request<ChecklistItemSummary>(`/checklist-templates/${templateId}/items`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateChecklistItem: (templateId: string, itemId: string, body: UpdateChecklistItemRequest) =>
      request<ChecklistItemSummary>(`/checklist-templates/${templateId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteChecklistItem: (templateId: string, itemId: string) =>
      request<void>(`/checklist-templates/${templateId}/items/${itemId}`, { method: "DELETE" }),
    moveChecklistItem: (templateId: string, itemId: string, direction: "up" | "down") =>
      request<void>(`/checklist-templates/${templateId}/items/${itemId}/move`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      }),
    createChecklistHoldPoint: (templateId: string, body: SaveChecklistHoldPointRequest) =>
      request<ChecklistHoldPointSummary>(`/checklist-templates/${templateId}/hold-points`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateChecklistHoldPoint: (templateId: string, holdPointId: string, body: SaveChecklistHoldPointRequest) =>
      request<ChecklistHoldPointSummary>(`/checklist-templates/${templateId}/hold-points/${holdPointId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    deleteChecklistHoldPoint: (templateId: string, holdPointId: string) =>
      request<void>(`/checklist-templates/${templateId}/hold-points/${holdPointId}`, { method: "DELETE" }),

    // --- Hold points & stage gate ---
    listHoldPoints: (projectId: string, phaseId?: string) =>
      request<HoldPointSummary[]>(`/projects/${projectId}/hold-points${phaseId ? `?phaseId=${phaseId}` : ""}`),
    instantiateHoldPoints: (projectId: string, phaseId: string, body: InstantiateHoldPointsRequest) =>
      request<HoldPointSummary[]>(`/projects/${projectId}/phases/${phaseId}/hold-points/from-template`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    signHoldPoint: (projectId: string, holdPointId: string, body: SignHoldPointRequest) =>
      request<HoldPointSummary>(`/projects/${projectId}/hold-points/${holdPointId}/sign`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    bypassHoldPoint: (projectId: string, holdPointId: string, body: BypassHoldPointRequest) =>
      request<HoldPointSummary>(`/projects/${projectId}/hold-points/${holdPointId}/bypass`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    reopenHoldPoint: (projectId: string, holdPointId: string, body: ReopenHoldPointRequest = {}) =>
      request<HoldPointSummary>(`/projects/${projectId}/hold-points/${holdPointId}/reopen`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    approvePhase: (projectId: string, phaseId: string) =>
      request<void>(`/projects/${projectId}/phases/${phaseId}/approve`, { method: "POST" }),
    releasePaymentMilestone: (projectId: string, contractId: string, milestoneId: string) =>
      request<ContractPaymentMilestoneSummary>(
        `/projects/${projectId}/contracts/${contractId}/payment-milestones/${milestoneId}/release`,
        { method: "POST" },
      ),

    // --- Lab tests, timed tests & notifications ---
    listConcretePours: (projectId: string) => request<ConcretePourSummary[]>(`/projects/${projectId}/concrete-pours`),
    createConcretePour: (projectId: string, body: CreateConcretePourRequest) =>
      request<ConcretePourSummary>(`/projects/${projectId}/concrete-pours`, { method: "POST", body: JSON.stringify(body) }),
    recordConcreteResult: (projectId: string, pourId: string, body: RecordConcreteResultRequest) =>
      request<ConcretePourSummary>(`/projects/${projectId}/concrete-pours/${pourId}/results`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    removeFormwork: (projectId: string, pourId: string) =>
      request<ConcretePourSummary>(`/projects/${projectId}/concrete-pours/${pourId}/formwork-removed`, { method: "POST" }),
    listTimedTests: (projectId: string) => request<TimedTestSummary[]>(`/projects/${projectId}/timed-tests`),
    startTimedTest: (projectId: string, body: StartTimedTestRequest) =>
      request<TimedTestSummary>(`/projects/${projectId}/timed-tests`, { method: "POST", body: JSON.stringify(body) }),
    completeTimedTest: (projectId: string, testId: string, body: CompleteTimedTestRequest) =>
      request<TimedTestSummary>(`/projects/${projectId}/timed-tests/${testId}/complete`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listNotifications: (unreadOnly = false) =>
      request<NotificationSummary[]>(`/notifications${unreadOnly ? "?unread=true" : ""}`),
    markNotificationRead: (notificationId: string) =>
      request<void>(`/notifications/${notificationId}/read`, { method: "POST" }),
    markAllNotificationsRead: () => request<void>("/notifications/read-all", { method: "POST" }),

    // --- Daily logs, Form 4 & reports ---
    listDailyLogs: (projectId: string) => request<DailyLogSummary[]>(`/projects/${projectId}/daily-logs`),
    getDailyLog: (projectId: string, logId: string) => request<DailyLogSummary>(`/projects/${projectId}/daily-logs/${logId}`),
    createDailyLog: (projectId: string, body: CreateDailyLogRequest) =>
      request<DailyLogSummary>(`/projects/${projectId}/daily-logs`, { method: "POST", body: JSON.stringify(body) }),
    updateDailyLog: (projectId: string, logId: string, body: SaveDailyLogRequest) =>
      request<DailyLogSummary>(`/projects/${projectId}/daily-logs/${logId}`, { method: "PUT", body: JSON.stringify(body) }),
    fetchDailyLogWeather: (projectId: string, logId: string) =>
      request<DailyLogSummary>(`/projects/${projectId}/daily-logs/${logId}/fetch-weather`, { method: "POST" }),
    approveDailyLog: (projectId: string, logId: string) =>
      request<DailyLogSummary>(`/projects/${projectId}/daily-logs/${logId}/approve`, { method: "POST" }),
    getForm4: (projectId: string) => request<Form4Readiness>(`/projects/${projectId}/form4`),
    saveForm4Item: (projectId: string, key: string, body: SaveForm4ItemRequest) =>
      request<Form4Readiness>(`/projects/${projectId}/form4/${key}`, { method: "PUT", body: JSON.stringify(body) }),
    downloadDailyLogPdf: (projectId: string, logId: string) => download(`/projects/${projectId}/daily-logs/${logId}/pdf`),
    downloadInspectionReport: (projectId: string, inspectionId: string) =>
      download(`/projects/${projectId}/inspections/${inspectionId}/report.pdf`),
    downloadBuildingFile: (projectId: string) => download(`/projects/${projectId}/building-file.zip`),

    // --- AI quote comparison ---
    listQuoteComparisons: (projectId: string) => request<QuoteComparisonSummary[]>(`/projects/${projectId}/quote-comparisons`),
    getQuoteComparison: (projectId: string, comparisonId: string) =>
      request<QuoteComparisonSummary>(`/projects/${projectId}/quote-comparisons/${comparisonId}`),
    createQuoteComparison: (projectId: string, body: CreateQuoteComparisonRequest) =>
      request<QuoteComparisonSummary>(`/projects/${projectId}/quote-comparisons`, { method: "POST", body: JSON.stringify(body) }),
    createQuoteUpload: (projectId: string, comparisonId: string, body: CreateQuoteUploadRequest) =>
      request<CreateQuoteUploadResponse>(`/projects/${projectId}/quote-comparisons/${comparisonId}/quotes/upload`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    confirmQuoteUpload: (projectId: string, comparisonId: string, quoteId: string, body: ConfirmQuoteUploadRequest) =>
      request<QuoteComparisonSummary>(`/projects/${projectId}/quote-comparisons/${comparisonId}/quotes/${quoteId}/confirm`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    analyzeQuoteComparison: (projectId: string, comparisonId: string) =>
      request<QuoteComparisonSummary>(`/projects/${projectId}/quote-comparisons/${comparisonId}/analyze`, { method: "POST" }),

    // --- Inspections & defects ---
    listInspections: (projectId: string) => request<InspectionSummary[]>(`/projects/${projectId}/inspections`),
    getInspection: (projectId: string, inspectionId: string) =>
      request<InspectionDetail>(`/projects/${projectId}/inspections/${inspectionId}`),
    createInspection: (projectId: string, body: CreateInspectionRequest) =>
      request<InspectionDetail>(`/projects/${projectId}/inspections`, { method: "POST", body: JSON.stringify(body) }),
    recordInspectionResult: (
      projectId: string,
      inspectionId: string,
      body: RecordInspectionResultRequest,
      opts?: RequestOptions,
    ) =>
      request<InspectionItemState>(`/projects/${projectId}/inspections/${inspectionId}/results`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: idempotencyHeaders(opts),
      }),
    completeInspection: (projectId: string, inspectionId: string) =>
      request<InspectionDetail>(`/projects/${projectId}/inspections/${inspectionId}/complete`, { method: "POST" }),
    createPhotoUpload: (projectId: string, body: CreatePhotoUploadRequest, opts?: RequestOptions) =>
      request<CreatePhotoUploadResponse>(`/projects/${projectId}/photos`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: idempotencyHeaders(opts),
      }),
    confirmPhotoUpload: (projectId: string, photoId: string, body: ConfirmPhotoUploadRequest, opts?: RequestOptions) =>
      request<PhotoSummary>(`/projects/${projectId}/photos/${photoId}/confirm`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: idempotencyHeaders(opts),
      }),
    listPhotos: (
      projectId: string,
      filter: { inspectionId?: string; checklistItemId?: string; defectId?: string; tag?: PhotoTag } = {},
    ) => {
      const query = new URLSearchParams(
        Object.entries(filter).filter((entry): entry is [string, string] => entry[1] !== undefined),
      ).toString();
      return request<PhotoSummary[]>(`/projects/${projectId}/photos${query ? `?${query}` : ""}`);
    },
    listDefects: (projectId: string) => request<DefectSummary[]>(`/projects/${projectId}/defects`),
    assignDefect: (projectId: string, defectId: string, body: AssignDefectRequest) =>
      request<DefectSummary>(`/projects/${projectId}/defects/${defectId}/assign`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    actOnDefect: (projectId: string, defectId: string, action: DefectAction, note?: string) =>
      request<DefectSummary>(`/projects/${projectId}/defects/${defectId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
