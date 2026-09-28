import type {
  AdminContractSummary,
  AdminDisputeSummary,
  AdminProjectSummary,
  AdminTenderSummary,
  ApproveFindingRequest,
  AuditEntrySummary,
  BidSummary,
  CadViewerDataResponse,
  ChangeMemberRoleRequest,
  ChatMessageSummary,
  ClientSummary,
  ConfirmDocumentUploadRequest,
  ContractPaymentMilestoneSummary,
  ContractSummary,
  ContractorProfileSelfSummary,
  ContractorSummary,
  CreateDocumentUploadRequest,
  CreateDocumentUploadResponse,
  CreateMeasurementRequest,
  CreateReviewRequest,
  CreateSiteCaptureUploadRequest,
  CreateSiteCaptureUploadResponse,
  CreateTenderRequest,
  DisputeSummary,
  DocumentSummary,
  DownloadUrlResponse,
  FindingSummary,
  HealthResponse,
  InviteMemberRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MeasurementSummary,
  ProjectDashboardResponse,
  ProjectMemberSummary,
  ProjectSummary,
  RaiseDisputeRequest,
  ResolveDisputeRequest,
  ReviewSummary,
  SelectWinnerRequest,
  SendChatMessageRequest,
  SendChatMessageResponse,
  SubmitBidRequest,
  TenderDetailResponse,
  TenderSummary,
  TrustScoreSummary,
  UpdateContractorProfileRequest,
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

export interface ApiClientOptions {
  /** Base URL of the api service, e.g. http://localhost:3000/api/v1 */
  baseUrl: string;
  /** Returns the current access token, if any. Kept as a callback so callers can read from their own auth store. */
  getAccessToken?: () => string | null;
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
export function createApiClient({ baseUrl, getAccessToken }: ApiClientOptions) {
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
