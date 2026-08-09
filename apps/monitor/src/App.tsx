import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { RequireAuth } from "./RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { ProjectSwitcherPage } from "./pages/ProjectSwitcherPage";
import { DashboardPage } from "./pages/DashboardPage";

function TopBar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="topbar">
      <div className="logo">
        Build<span>Guard</span>
      </div>
      <div className="spacer" />
      <div className="who">{user.displayName}</div>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}

export function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ProjectSwitcherPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
