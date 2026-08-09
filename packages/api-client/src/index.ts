import type {
  HealthResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  ProjectDashboardResponse,
  ProjectSummary,
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
