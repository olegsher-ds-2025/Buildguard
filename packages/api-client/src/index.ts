import type {
  AdminProjectSummary,
  ApproveFindingRequest,
  AuditEntrySummary,
  ClientSummary,
  ConfirmDocumentUploadRequest,
  ContractorSummary,
  CreateDocumentUploadRequest,
  CreateDocumentUploadResponse,
  CreateSiteCaptureUploadRequest,
  CreateSiteCaptureUploadResponse,
  DocumentSummary,
  DownloadUrlResponse,
  FindingSummary,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  ProjectDashboardResponse,
  ProjectSummary,
  UserDirectoryEntry,
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
