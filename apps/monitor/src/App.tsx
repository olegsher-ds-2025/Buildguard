import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/**
 * M0 placeholder: proves the frontend can reach the API through
 * @buildguard/api-client end to end. Real routes (login, project switcher,
 * dashboard, documents, findings, team) land in M2+ per the build plan.
 */
export function App() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>BuildGuard Monitor</h1>
      <p>Customer-facing project monitoring — scaffold in progress.</p>
      <p>
        API status:{" "}
        {health.isLoading
          ? "checking…"
          : health.isError
            ? `unreachable (${(health.error as Error).message})`
            : `${health.data?.status} — ${health.data?.service}`}
      </p>
    </main>
  );
}
