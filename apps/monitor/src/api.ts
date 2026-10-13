import { createApiClient } from "@buildguard/api-client";

export const UNAUTHORIZED_EVENT = "bg:unauthorized";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const api = createApiClient({
  baseUrl,
  getAccessToken: () => localStorage.getItem("bg_monitor_access_token"),
  onUnauthorized: () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)),
});
