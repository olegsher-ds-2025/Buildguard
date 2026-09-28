import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { RequireAuth } from "./RequireAuth";
import { ProjectNav } from "./ProjectNav";
import { LoginPage } from "./pages/LoginPage";
import { ProjectSwitcherPage } from "./pages/ProjectSwitcherPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { FindingsPage } from "./pages/FindingsPage";
import { TeamPage } from "./pages/TeamPage";
import { TendersPage } from "./pages/TendersPage";
import { TenderDetailPage } from "./pages/TenderDetailPage";
import { BidComparisonPage } from "./pages/BidComparisonPage";
import { ContractPage } from "./pages/ContractPage";
import { ContractorProfilePage } from "./pages/ContractorProfilePage";
import { ChatPage } from "./pages/ChatPage";
import { CadViewerPage } from "./pages/CadViewerPage";

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
          <Route path="team" element={<TeamPage />} />
          <Route path="tenders" element={<TendersPage />} />
          <Route path="tenders/:tenderId" element={<TenderDetailPage />} />
          <Route path="tenders/:tenderId/bids" element={<BidComparisonPage />} />
          <Route path="contracts/:contractId" element={<ContractPage />} />
          <Route path="contractor-profile" element={<ContractorProfilePage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="documents/:documentId/cad" element={<CadViewerPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
