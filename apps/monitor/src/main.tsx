import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { OfflineProvider } from "./offline/OfflineProvider";
import "./styles.css";

// By default TanStack Query pauses requests while the browser reports offline, which would stop a
// mutation from ever reaching the offline queue. Run them regardless and let the offline layer decide;
// reads try once and fall back to the cached copy. Failures that never reached the server are not retried here.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      retry: (count, error) => typeof (error as { status?: unknown }).status !== "number" && count < 1,
    },
    mutations: { networkMode: "always" },
  },
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <OfflineProvider>
            <App />
          </OfflineProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
