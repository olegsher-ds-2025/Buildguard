import { createApiClient } from "@buildguard/api-client";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const api = createApiClient({
  baseUrl,
  getAccessToken: () => localStorage.getItem("bg_admin_access_token"),
});
