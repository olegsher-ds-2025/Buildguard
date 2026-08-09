import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { RequireAuth } from "./RequireAuth";
import { ProjectNav } from "./ProjectNav";
import { LoginPage } from "./pages/LoginPage";
import { ProjectSwitcherPage } from "./pages/ProjectSwitcherPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { FindingsPage } from "./pages/FindingsPage";

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

function ProjectLayout() {
  return (
    <>
      <ProjectNav />
      <Outlet />
    </>
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
              <ProjectLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="findings" element={<FindingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
